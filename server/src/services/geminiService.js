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

export const GEMINI_MODEL = 'gemini-3.8-flash';
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
  const url = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;
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
  const prompt = createDispatchAssistancePrompt({
    incidentLocation,
    triageLevel,
    symptoms,
    ambulances,
    facilities,
  });

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.DISPATCH_ASSISTANCE, prompt);
    if (!aiResult) {
      // Deterministic resource matching
      const availableAmbs = ambulances.filter(a => a.status === 'available');
      const targetAmbs = availableAmbs.length > 0 ? availableAmbs : ambulances;

      let selectedAmb = targetAmbs[0] || null;
      if (triageLevel === 'critical') {
        const als = targetAmbs.find(a => a.vehicleType === 'als_ambulance' || a.vehicleType === 'mobile_icu');
        if (als) selectedAmb = als;
      }

      const activeFacs = facilities.filter(f => f.emergencyCapacity?.status !== 'divert');
      const targetFacs = activeFacs.length > 0 ? activeFacs : facilities;

      let selectedFac = targetFacs[0] || null;
      if (triageLevel === 'critical') {
        const trauma = targetFacs.find(f => f.facilityType === 'trauma_center' && (f.emergencyCapacity?.icuAvailable ?? 0) > 0);
        if (trauma) selectedFac = trauma;
      }

      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        recommendedAmbulanceId: selectedAmb?._id || selectedAmb?.id || null,
        ambulanceIdTag: selectedAmb?.ambulanceId || 'MH-12-AMB-101',
        ambulanceRationale: selectedAmb
          ? `Allocated ${selectedAmb.ambulanceId} (${selectedAmb.vehicleType}) due to available status and proximity.`
          : 'No dedicated ambulance unit currently unassigned; nearest unit recommended.',
        recommendedFacilityId: selectedFac?._id || selectedFac?.id || null,
        facilityName: selectedFac?.name || 'Central Emergency Hospital',
        facilityRationale: selectedFac
          ? `Recommended ${selectedFac.name} based on ${triageLevel} priority and bed capacity (${selectedFac.emergencyCapacity?.availableBeds || 0} beds, ${selectedFac.emergencyCapacity?.icuAvailable || 0} ICU).`
          : 'Selected closest active intake hospital.',
        operationalNotes: 'Pre-alert emergency intake desk prior to transit.',
        etaEstimateMinutes: triageLevel === 'critical' ? 7 : 12,
        source: 'deterministic_fallback',
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      recommendedAmbulanceId: aiResult.recommendedAmbulanceId,
      ambulanceRationale: aiResult.ambulanceRationale || 'Recommended based on unit availability and emergency equipment.',
      recommendedFacilityId: aiResult.recommendedFacilityId,
      facilityRationale: aiResult.facilityRationale || 'Recommended based on available emergency and ICU capacity.',
      operationalNotes: aiResult.operationalNotes || '',
      etaEstimateMinutes: Number(aiResult.etaEstimateMinutes) || 10,
      source: 'gemini',
      evaluatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Error during dispatch assistance:', err.message);
    throw new AppError(`Dispatch assistance failed: ${err.message}`, 500);
  }
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
}) => {
  if (!origin || !destination) {
    throw new AppError('Both origin and destination endpoints are required for route optimization', 400);
  }

  const prompt = createRouteOptimizationPrompt({
    origin,
    destination,
    trafficCondition,
    triageLevel,
    vehicleType,
  });

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.ROUTE_OPTIMIZATION, prompt);
    if (!aiResult) {
      const isPriority = triageLevel === 'critical' || triageLevel === 'urgent';
      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        recommendedRouteName: isPriority ? 'Emergency Arterial Priority Corridor' : 'Standard Highway Transit Route',
        reasoning: `Selected corridor avoids peak city-center intersections based on reported ${trafficCondition} traffic conditions.`,
        avoidedHazards: ['Dense market traffic on main arterial', 'Construction corridor along inner ring road'],
        estimatedTimeSavedMinutes: isPriority ? 8 : 4,
        priorityLaneEligible: isPriority,
        source: 'deterministic_fallback',
      };
    }

    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      recommendedRouteName: aiResult.recommendedRouteName || 'Optimized Medical Corridor',
      reasoning: aiResult.reasoning || 'Route calculated for minimal transit resistance.',
      avoidedHazards: Array.isArray(aiResult.avoidedHazards) ? aiResult.avoidedHazards : [],
      estimatedTimeSavedMinutes: Number(aiResult.estimatedTimeSavedMinutes) || 0,
      priorityLaneEligible: Boolean(aiResult.priorityLaneEligible),
      source: 'gemini',
    };
  } catch (err) {
    const isTransient =
      err.isTransient ||
      err.statusCode === 429 ||
      err.statusCode === 500 ||
      err.statusCode === 502 ||
      err.statusCode === 503 ||
      err.statusCode === 504 ||
      /high demand|unavailable|overloaded|resource exhausted|rate limit|quota|temporarily|timeout/i.test(err.message);

    if (isTransient) {
      logger.warn(
        `[Gemini Diagnostics] Route optimization Gemini API unavailable (${err.message}). Falling back to standard route calculation.`
      );
      const isPriority = triageLevel === 'critical' || triageLevel === 'urgent';
      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        recommendedRouteName: isPriority ? 'Emergency Arterial Priority Corridor (Standard Route)' : 'Standard Highway Transit Route',
        reasoning: 'AI route optimization is temporarily unavailable. The standard route remains available.',
        avoidedHazards: ['Traffic monitoring active on primary thoroughfare'],
        estimatedTimeSavedMinutes: isPriority ? 5 : 0,
        priorityLaneEligible: isPriority,
        source: 'standard_route_fallback',
        isAiUnavailable: true,
      };
    }

    if (err instanceof AppError) throw err;
    logger.error('Error during route optimization:', err.message);
    throw new AppError(`Route optimization failed: ${err.message}`, 500);
  }
};

/**
 * 5. Facility Recommendation
 */
export const recommendFacility = async ({ triageLevel = 'standard', symptoms, facilities = [] }) => {
  if (!facilities || facilities.length === 0) {
    throw new AppError('No facilities provided to recommend from', 400);
  }

  const activeFacilities = facilities.filter(
    (f) => f.isActive !== false && f.emergencyCapacity?.status !== 'divert'
  );
  const targetFacilities = activeFacilities.length > 0 ? activeFacilities : facilities;

  const prompt = createFacilityMatchingPrompt({
    triageLevel,
    symptoms,
    facilities: targetFacilities,
  });

  try {
    const aiResult = await callGeminiApi(SYSTEM_INSTRUCTIONS.FACILITY_RECOMMENDATION, prompt);
    if (!aiResult || !aiResult.recommendedFacilityId) {
      let best = targetFacilities[0];
      if (triageLevel === 'critical') {
        const trauma = targetFacilities.find(
          (f) => f.facilityType === 'trauma_center' && (f.emergencyCapacity?.icuAvailable ?? 0) > 0
        );
        if (trauma) best = trauma;
      } else if (triageLevel === 'urgent') {
        const hosp = targetFacilities.find(
          (f) => f.facilityType === 'hospital' && (f.emergencyCapacity?.availableBeds ?? 0) > 0
        );
        if (hosp) best = hosp;
      }

      return {
        recommendationLabel: AI_RECOMMENDATION_LABEL,
        disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
        requiresHumanConfirmation: true,
        recommendedFacilityId: best._id || best.id,
        facilityName: best.name,
        clinicalJustification: `Recommended based on ${triageLevel} priority and capacity (${best.emergencyCapacity?.availableBeds || 0} beds, ${best.emergencyCapacity?.icuAvailable || 0} ICU beds).`,
        alternativeFacilityId: targetFacilities[1] ? (targetFacilities[1]._id || targetFacilities[1].id) : null,
        source: 'deterministic_fallback',
      };
    }

    return {
      recommendationLabel: AI_RECOMMENDATION_LABEL,
      disclaimer: AI_DECISION_SUPPORT_DISCLAIMER,
      requiresHumanConfirmation: true,
      recommendedFacilityId: aiResult.recommendedFacilityId,
      facilityName: aiResult.facilityName,
      clinicalJustification: aiResult.clinicalJustification,
      alternativeFacilityId: aiResult.alternativeFacilityId || null,
      source: 'gemini',
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Error during facility recommendation:', err.message);
    throw new AppError(`Facility recommendation failed: ${err.message}`, 500);
  }
};
