import { config } from '../config/env.js';
import {
  SYSTEM_INSTRUCTIONS,
  createTriagePrompt,
  createRouteOptimizationPrompt,
  createFacilityMatchingPrompt,
  createIncidentSummaryPrompt,
  createDispatchAssistancePrompt,
} from '../config/aiPrompts.js';
import logger from '../utils/logger.js';
import AppError from '../utils/appError.js';
import { calculateDeterministicRoute } from './routing/graphAdapter.js';
import { evaluateAllocation } from './allocationService.js';

export const GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_API_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const AI_RECOMMENDATION_LABEL = 'AI-Assisted Recommendation';
const AI_DECISION_SUPPORT_DISCLAIMER =
  'Decision-support only. This system does not make definitive medical diagnoses. Final operational decisions must remain with authorized human staff.';

/**
 * Clean and parse JSON from Gemini's response text.
 * Handles markdown formatting (```json ... ```), unexpected whitespace, and common LLM output quirks.
 * @param {string} rawText
 * @returns {object} Parsed JSON object
 */
export const cleanAndParseJsonResponse = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Malformed or empty AI response text received');
  }

  let text = rawText.trim();

  // Strip markdown code fences if present (e.g. ```json ... ``` or ``` ...)
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '');
    const lastFence = text.lastIndexOf('```');
    if (lastFence !== -1) {
      text = text.substring(0, lastFence).trim();
    }
  }

  // Attempt direct JSON parse
  try {
    return JSON.parse(text);
  } catch {
    // Attempt extracting the first JSON object bounded by { and }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        throw new Error(`Failed to parse extracted JSON object: ${innerErr.message}`);
      }
    }
    throw new Error('AI response did not contain a valid JSON payload');
  }
};

/**
 * Execute raw Gemini REST API call with retry for rate limits (429) and timeout.
 */
export const callGeminiApi = async (systemInstruction, userPrompt, retryCount = 0) => {
  const hasApiKey = Boolean(config.geminiApiKey);

  // Safe diagnostic logging (NEVER print the API key)
  logger.info(`[Gemini Diagnostics] Initiating call - Model: "${GEMINI_MODEL}", GEMINI_API_KEY exists: ${hasApiKey}`);

  if (!hasApiKey) {
    logger.warn('GEMINI_API_KEY is not configured in backend environment; executing fallback simulation.');
    return null; // Triggers deterministic fallback
  }

  const apiKey = config.geminiApiKey;
  const url = GEMINI_API_ENDPOINT;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Safe diagnostic logging of HTTP status
    logger.info(`[Gemini Diagnostics] Model: "${GEMINI_MODEL}", HTTP Status: ${res.status}`);

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const message = errorBody?.error?.message || `Gemini API error with status ${res.status}`;

      // Distinguish permanent client errors (invalid key, bad request, forbidden) from transient service errors
      const isPermanentClientError = [400, 401, 403, 404].includes(res.status);
      const isTransient =
        !isPermanentClientError &&
        (res.status === 429 ||
          res.status === 500 ||
          res.status === 502 ||
          res.status === 503 ||
          /high demand|unavailable|overloaded|resource exhausted|rate limit|quota|temporarily/i.test(message));

      if (isTransient && retryCount < 2) {
        const delay = (retryCount + 1) * 1000; // retry 1: ~1000ms, retry 2: ~2000ms
        logger.warn(
          `[Gemini Diagnostics] Transient Gemini error (HTTP ${res.status}: ${message}). Retrying in ${delay}ms... (attempt ${retryCount + 1}/2)`
        );
        await new Promise((r) => setTimeout(r, delay));
        return callGeminiApi(systemInstruction, userPrompt, retryCount + 1);
      }

      // Safe diagnostic logging (status and error message only, NEVER API key or full URL)
      logger.error(
        `[Gemini Diagnostics] Final failure - Model: "${GEMINI_MODEL}", HTTP Status: ${res.status}, Error Message: ${message}`
      );
      const err = new AppError(`AI Service Unavailable: ${message}`, res.status >= 500 ? 503 : res.status);
      err.isTransient = isTransient;
      throw err;
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini response candidate content was empty or filtered');
    }

    return cleanAndParseJsonResponse(candidateText);
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err.name === 'AbortError' || err.code === 'ECONNRESET' || /fetch failed/i.test(err.message)) && retryCount < 2) {
      const delay = (retryCount + 1) * 1000;
      logger.warn(
        `[Gemini Diagnostics] Network/Timeout error (${err.message}). Retrying in ${delay}ms... (attempt ${retryCount + 1}/2)`
      );
      await new Promise((r) => setTimeout(r, delay));
      return callGeminiApi(systemInstruction, userPrompt, retryCount + 1);
    }

    if (err.name === 'AbortError') {
      logger.error(`[Gemini Diagnostics] Model: "${GEMINI_MODEL}", Gemini AI request timed out after retries.`);
      const timeoutErr = new AppError('Gemini AI request timed out.', 504);
      timeoutErr.isTransient = true;
      throw timeoutErr;
    }
    throw err;
  }
};

/**
 * 1. Clinical Triage Assistance
 */
export const assessTriage = async ({ symptoms, patientContext, vitalSigns }) => {
  if (!symptoms || (Array.isArray(symptoms) && symptoms.length === 0)) {
    throw new AppError('Patient symptoms must be provided for clinical triage assessment', 400);
  }

  const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : String(symptoms);
  const prompt = createTriagePrompt({ symptoms, patientContext, vitalSigns });

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.CLINICAL_TRIAGE, prompt);
    if (!aiResult) {
      const lower = symptomsText.toLowerCase();
      const isCritical = ['chest pain', 'cardiac', 'arrest', 'unconscious', 'stroke', 'heavy bleeding', 'severe trauma'].some(k => lower.includes(k));
      const isUrgent = ['fracture', 'broken', 'fever', 'abdominal', 'burn', 'shortness of breath'].some(k => lower.includes(k));

      const triageLevel = isCritical ? 'critical' : isUrgent ? 'urgent' : 'standard';
      const urgencyScore = isCritical ? 9 : isUrgent ? 6 : 3;

      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        urgencyScore,
        triageLevel,
        recommendedFacilityType: isCritical ? 'trauma_center' : isUrgent ? 'hospital' : 'clinic',
        recommendedVehicleType: isCritical ? 'als_ambulance' : isUrgent ? 'bls_ambulance' : 'standard_transport',
        summary: `Operational evaluation for symptoms: ${symptomsText}. Urgency assessed at level ${urgencyScore}/10 (${triageLevel}).`,
        recommendations: [
          isCritical ? 'Dispatch Advanced Life Support (ALS) with cardiac telemetry' : 'Assign BLS unit with vital sign monitoring',
          'Coordinate immediate alert with receiving emergency triage team',
        ],
        potentialRisks: [
          isCritical ? 'Acute hemodynamic collapse or airway compromise' : 'Escalation of distress or mobility limitation',
        ],
        source: 'deterministic_fallback',
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      urgencyScore: Math.min(10, Math.max(1, Number(aiResult.urgencyScore) || 5)),
      triageLevel: ['critical', 'urgent', 'standard'].includes(aiResult.triageLevel)
        ? aiResult.triageLevel
        : 'standard',
      recommendedFacilityType: aiResult.recommendedFacilityType || 'hospital',
      recommendedVehicleType: aiResult.recommendedVehicleType || 'standard_transport',
      summary: aiResult.summary || 'Clinical evaluation completed.',
      recommendations: Array.isArray(aiResult.recommendations) ? aiResult.recommendations : [],
      potentialRisks: Array.isArray(aiResult.potentialRisks) ? aiResult.potentialRisks : [],
      source: 'gemini',
      evaluatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Error during triage assessment:', err.message);
    throw new AppError(`Triage evaluation failed: ${err.message}`, 500);
  }
};

/**
 * 2. Emergency / Incident Summarization
 */
export const summarizeIncident = async (incidentData) => {
  const { patientName, pickupAddress, symptoms, triageLevel, vitalSigns, notes } = incidentData;
  const prompt = createIncidentSummaryPrompt(incidentData);

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.INCIDENT_SUMMARIZATION, prompt);
    if (!aiResult) {
      const symp = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms || 'Medical distress';
      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        operationalSummary: `Emergency incident involving ${patientName || 'patient'} at ${pickupAddress || 'reported address'}. Presenting: ${symp}. Urgency: ${triageLevel || 'standard'}.`,
        situationalOverview: `Dispatch active at ${pickupAddress || 'scene'}. Field responders advised to evaluate airway and hemodynamic stability upon arrival.`,
        keyHazards: ['Traffic congestion along arterial route', 'Patient mobility constraints'],
        responderDirectives: [
          'Verify patient responsiveness and baseline vitals on arrival',
          'Establish direct dispatch channel with receiving hospital ER',
        ],
        suggestedTriage: triageLevel || 'standard',
        source: 'deterministic_fallback',
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      operationalSummary: aiResult.operationalSummary || 'Operational incident summary generated.',
      situationalOverview: aiResult.situationalOverview || '',
      keyHazards: Array.isArray(aiResult.keyHazards) ? aiResult.keyHazards : [],
      responderDirectives: Array.isArray(aiResult.responderDirectives) ? aiResult.responderDirectives : [],
      suggestedTriage: ['critical', 'urgent', 'standard'].includes(aiResult.suggestedTriage)
        ? aiResult.suggestedTriage
        : (triageLevel || 'standard'),
      source: 'gemini',
      evaluatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Error during incident summarization:', err.message);
    throw new AppError(`Incident summarization failed: ${err.message}`, 500);
  }
};

/**
 * 3. Dispatch Assistance (Ambulance + Hospital Matching)
 */
export const getDispatchAssistance = async ({
  incidentLocation,
  triageLevel = 'standard',
  symptoms,
  ambulances = [],
  facilities = [],
}) => {
  // 1. Evaluate candidate resources with deterministic multi-criteria engine
  const allocation = await evaluateAllocation({
    incidentLocation,
    triageLevel,
    symptoms,
    ambulances,
    facilities,
  });

  if (!allocation.isFeasible) {
    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      isFeasible: false,
      recommendedAmbulanceId: null,
      ambulanceIdTag: null,
      ambulanceRationale: allocation.failureReason || 'No feasible ambulance found matching constraints.',
      recommendedFacilityId: null,
      facilityName: null,
      facilityRationale: allocation.failureReason || 'No feasible facility found matching constraints.',
      operationalNotes: 'Immediate dispatcher intervention required: dispatch constraints could not be satisfied.',
      etaEstimateMinutes: 0,
      source: 'deterministic_allocation',
      evaluatedAt: allocation.evaluatedAt,
      rejectedAmbulances: allocation.rejectedAmbulances,
      rejectedFacilities: allocation.rejectedFacilities,
    };
  }

  const selectedAmb = allocation.selectedAmbulance;
  const selectedFac = allocation.selectedFacility;
  let operationalNotes = 'Pre-alert emergency intake desk prior to transit.';

  let ambulanceRationale = `Allocated ${selectedAmb.ambulanceId} (${selectedAmb.vehicleType}) with multi-criteria score ${selectedAmb.score} (ETA: ${selectedAmb.estimatedEtaMinutes} min).`;
  let facilityRationale = `Recommended ${selectedFac.name} based on ${triageLevel} priority and capacity (${selectedFac.availableBeds} beds, ${selectedFac.icuAvailable} ICU beds, score: ${selectedFac.score}).`;

  // 2. If Gemini is configured, use it solely for qualitative narrative explanation
  try {
    const prompt = createDispatchAssistancePrompt({
      incidentLocation,
      triageLevel,
      symptoms,
      ambulances: [selectedAmb],
      facilities: [selectedFac],
    });
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.DISPATCH_ASSISTANCE, prompt);
    if (aiResult) {
      if (aiResult.operationalNotes) operationalNotes = aiResult.operationalNotes;
      if (aiResult.ambulanceRationale) ambulanceRationale = `${ambulanceRationale} Note: ${aiResult.ambulanceRationale}`;
      if (aiResult.facilityRationale) facilityRationale = `${facilityRationale} Note: ${aiResult.facilityRationale}`;
    }
  } catch (err) {
    logger.warn(`[Gemini Diagnostics] AI dispatch assistance explanation unavailable (${err.message}). Using deterministic rationale.`);
  }

  return {
    recommendationLabel: AI_RECOMMENDATION_LABEL,
    disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
    requiresHumanConfirmation: true,
    isFeasible: true,
    recommendedAmbulanceId: selectedAmb.id,
    ambulanceIdTag: selectedAmb.ambulanceId,
    ambulanceRationale,
    recommendedFacilityId: selectedFac.id,
    facilityName: selectedFac.name,
    facilityRationale,
    operationalNotes,
    etaEstimateMinutes: selectedAmb.estimatedEtaMinutes,
    source: 'deterministic_allocation',
    evaluatedAt: allocation.evaluatedAt,
    allocationDetails: {
      ambulanceScore: selectedAmb.score,
      facilityScore: selectedFac.score,
      scoringEquation: allocation.scoringEquation,
      weights: allocation.weights,
      rawMetrics: {
        ambulance: selectedAmb.rawMetrics,
        facility: selectedFac.rawMetrics,
      },
      normalizedMetrics: {
        ambulance: selectedAmb.normalizedMetrics,
        facility: selectedFac.normalizedMetrics,
      },
      feasibleAmbulanceCount: allocation.feasibleAmbulances.length,
      rejectedAmbulanceCount: allocation.rejectedAmbulances.length,
      feasibleFacilityCount: allocation.feasibleFacilities.length,
      rejectedFacilityCount: allocation.rejectedFacilities.length,
      rejectedAmbulances: allocation.rejectedAmbulances,
      rejectedFacilities: allocation.rejectedFacilities,
    },
  };
};

/**
 * 4. Route Optimization
 */
export const optimizeRoute = async ({
  origin,
  destination,
  trafficCondition = 'moderate',
  triageLevel = 'standard',
  vehicleType = 'standard_transport',
  algorithm = 'a_star',
  costMetric = 'time',
  roadClosures = [],
  congestionOverrides = {},
}) => {
  if (!origin || !destination) {
    throw new AppError('Both origin and destination endpoints are required for route optimization', 400);
  }

  // 1. Calculate deterministic shortest path on the road network
  const deterministicResult = calculateDeterministicRoute({
    origin,
    destination,
    algorithm,
    costMetric,
    trafficCondition,
    triageLevel,
    roadClosures,
    congestionOverrides,
  });

  // If validation failed
  if (!deterministicResult.success && !deterministicResult.isGraphRouted && deterministicResult.source !== 'standard_route_fallback') {
    throw new AppError(deterministicResult.failureReason || 'Routing calculation could not be completed', 400);
  }

  // 2. Prepare narrative explanation.
  // Gemini is used solely for narrative explanation and human-digestible dispatch summary;
  // it never calculates or overrides the deterministic graph route or cost.
  let reasoning = deterministicResult.isGraphRouted
    ? `Deterministic ${deterministicResult.algorithm.toUpperCase()} routing selected corridor "${deterministicResult.recommendedRouteName}" based on real-time road topology, speed limits, and ${trafficCondition} traffic.`
    : `Standard route calculation applied (${deterministicResult.fallbackReason || 'Outside demonstration network'}).`;

  if (deterministicResult.avoidedHazards?.length > 0) {
    reasoning += ` Path actively circumvents: ${deterministicResult.avoidedHazards.join(', ')}.`;
  }

  const prompt = createRouteOptimizationPrompt({
    origin,
    destination,
    trafficCondition,
    triageLevel,
    vehicleType,
    calculatedRoute: {
      corridorName: deterministicResult.recommendedRouteName,
      distanceKm: deterministicResult.totalDistanceKm,
      durationMinutes: deterministicResult.estimatedDurationMinutes,
      avoidedHazards: deterministicResult.avoidedHazards,
      isGraphRouted: deterministicResult.isGraphRouted,
    },
  });

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.ROUTE_OPTIMIZATION, prompt);
    if (aiResult && aiResult.reasoning) {
      reasoning = aiResult.reasoning;
    }
  } catch (err) {
    // If Gemini fails or times out, the deterministic calculation remains completely authoritative
    logger.warn(`[Gemini Diagnostics] Route narrative explanation unavailable (${err.message}). Using deterministic reasoning.`);
  }

  return {
    recommendationLabel: AI_RECOMMENDATION_LABEL,
    disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
    requiresHumanConfirmation: true,
    recommendedRouteName: deterministicResult.recommendedRouteName,
    corridorName: deterministicResult.corridorName,
    reasoning,
    avoidedHazards: deterministicResult.avoidedHazards || [],
    estimatedTimeSavedMinutes: deterministicResult.estimatedTimeSavedMinutes || 0,
    priorityLaneEligible: Boolean(deterministicResult.priorityLaneEligible),
    totalDistanceKm: deterministicResult.totalDistanceKm,
    estimatedDurationMinutes: deterministicResult.estimatedDurationMinutes,
    totalCost: deterministicResult.totalCost,
    algorithm: deterministicResult.algorithm,
    costMetric: deterministicResult.costMetric,
    expandedNodeCount: deterministicResult.expandedNodeCount,
    nodeSequence: deterministicResult.nodeSequence || [],
    edgeSequence: deterministicResult.edgeSequence || [],
    waypoints: deterministicResult.waypoints || [],
    isGraphRouted: Boolean(deterministicResult.isGraphRouted),
    source: deterministicResult.source,
    graphMetadata: deterministicResult.graphMetadata,
  };
};

/**
 * 5. Facility Recommendation
 */
export const recommendFacility = async ({ triageLevel = 'standard', symptoms, facilities = [] }) => {
  if (!facilities || facilities.length === 0) {
    throw new AppError('No facilities provided to recommend from', 400);
  }

  // Evaluate facilities using deterministic multi-criteria engine
  const allocation = await evaluateAllocation({
    triageLevel,
    symptoms,
    facilities,
    ambulances: [], // only facilities evaluated
  });

  if (!allocation.selectedFacility) {
    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      isFeasible: false,
      recommendedFacilityId: null,
      facilityName: null,
      clinicalJustification: allocation.failureReason || 'No feasible facility found satisfying clinical and capacity constraints.',
      alternativeFacilityId: null,
      source: 'deterministic_allocation',
      rejectedFacilities: allocation.rejectedFacilities,
    };
  }

  const best = allocation.selectedFacility;
  const alt = allocation.feasibleFacilities[1] || null;
  let clinicalJustification = `Recommended ${best.name} based on ${triageLevel} priority and capacity (${best.availableBeds} beds, ${best.icuAvailable} ICU beds, score: ${best.score}).`;

  try {
    const prompt = createFacilityMatchingPrompt({
      triageLevel,
      symptoms,
      facilities: [best],
    });
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.FACILITY_RECOMMENDATION, prompt);
    if (aiResult?.clinicalJustification) {
      clinicalJustification = `${clinicalJustification} Clinical note: ${aiResult.clinicalJustification}`;
    }
  } catch (err) {
    logger.warn(`[Gemini Diagnostics] AI facility recommendation explanation unavailable (${err.message}). Using deterministic rationale.`);
  }

  return {
    recommendationLabel: AI_RECOMMENDATION_LABEL,
    disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
    requiresHumanConfirmation: true,
    recommendedFacilityId: best.id,
    facilityName: best.name,
    clinicalJustification,
    alternativeFacilityId: alt ? alt.id : null,
    source: 'deterministic_allocation',
    allocationDetails: {
      facilityScore: best.score,
      rawMetrics: best.rawMetrics,
      normalizedMetrics: best.normalizedMetrics,
      feasibleFacilityCount: allocation.feasibleFacilities.length,
      rejectedFacilityCount: allocation.rejectedFacilities.length,
      rejectedFacilities: allocation.rejectedFacilities,
    },
  };
};
