import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as geminiService from '../services/geminiService.js';
import * as facilityService from '../services/facilityService.js';
import Ambulance from '../models/Ambulance.js';
import { config } from '../config/env.js';
import AppError from '../utils/appError.js';

/**
 * @route   GET /api/ai/status
 * @desc    Check AI service availability and operational readiness
 * @access  Public (Safe summary, zero secrets exposed)
 */
export const getAiStatus = asyncHandler(async (req, res) => {
  const isConfigured = Boolean(config.geminiApiKey);

  return sendSuccess(
    res,
    {
      configured: isConfigured,
      model: geminiService.GEMINI_MODEL,
      mode: isConfigured ? 'live' : 'fallback_simulation',
      capabilities: [
        'clinical_triage',
        'incident_summarization',
        'dispatch_assistance',
        'facility_allocation',
        'route_optimization',
      ],
      notice: 'AI recommendations provide decision-support only and require human staff confirmation.',
    },
    'AI service status retrieved',
    200
  );
});

/**
 * @route   POST /api/ai/triage
 * @desc    Assess patient symptoms and compute urgency triage score
 * @access  Protected
 */
export const assessTriage = asyncHandler(async (req, res) => {
  const { symptoms, patientContext, vitalSigns } = req.body;

  if (!symptoms) {
    throw new AppError('Field "symptoms" is required (string or array of strings)', 400);
  }

  if (typeof symptoms === 'string' && symptoms.trim().length === 0) {
    throw new AppError('Field "symptoms" cannot be empty', 400);
  }

  if (Array.isArray(symptoms) && symptoms.length === 0) {
    throw new AppError('Symptoms array cannot be empty', 400);
  }

  const result = await geminiService.assessTriage({
    symptoms,
    patientContext,
    vitalSigns,
  });

  return sendSuccess(res, result, 'Clinical triage assessment generated successfully', 200);
});

/**
 * @route   POST /api/ai/summarize-incident
 * @desc    Generate concise operational summary of an emergency incident
 * @access  Protected
 */
export const summarizeIncident = asyncHandler(async (req, res) => {
  const { patientName, pickupAddress, symptoms, triageLevel, vitalSigns, notes } = req.body;

  const result = await geminiService.summarizeIncident({
    patientName,
    pickupAddress,
    symptoms,
    triageLevel,
    vitalSigns,
    notes,
  });

  return sendSuccess(res, result, 'Operational incident summary generated successfully', 200);
});

/**
 * @route   POST /api/ai/dispatch-assistance
 * @desc    Get AI recommendation for optimal ambulance and facility allocation
 * @access  Protected
 */
export const getDispatchAssistance = asyncHandler(async (req, res) => {
  const { incidentLocation, triageLevel, symptoms } = req.body;

  // Retrieve current active ambulances and facilities from MongoDB
  const [ambulances, facilities] = await Promise.all([
    Ambulance.find({ isActive: true }).lean(),
    facilityService.getAllFacilities({ isActive: true }),
  ]);

  const result = await geminiService.getDispatchAssistance({
    incidentLocation,
    triageLevel,
    symptoms,
    ambulances,
    facilities,
  });

  return sendSuccess(res, result, 'Dispatch resource recommendation generated', 200);
});

/**
 * @route   POST /api/ai/optimize-route
 * @desc    Optimize transit corridor and analyze potential traffic bottlenecks
 * @access  Protected
 */
export const optimizeRoute = asyncHandler(async (req, res) => {
  const { origin, destination, trafficCondition, triageLevel, vehicleType } = req.body;

  if (!origin || (typeof origin === 'object' && !origin.address && (!origin.latitude || !origin.longitude))) {
    throw new AppError('Origin location with address or coordinates is required', 400);
  }

  if (!destination || (typeof destination === 'object' && !destination.address && (!destination.latitude || !destination.longitude))) {
    throw new AppError('Destination location with address or coordinates is required', 400);
  }

  const result = await geminiService.optimizeRoute({
    origin,
    destination,
    trafficCondition,
    triageLevel,
    vehicleType,
  });

  return sendSuccess(res, result, 'Emergency route optimization calculated', 200);
});

/**
 * @route   POST /api/ai/recommend-facility
 * @desc    Recommend destination facility matching clinical needs with real hospital capacity
 * @access  Protected
 */
export const recommendFacility = asyncHandler(async (req, res) => {
  const { triageLevel, symptoms, facilities: providedFacilities } = req.body;

  let facilities = providedFacilities;
  if (!facilities || facilities.length === 0) {
    facilities = await facilityService.getAllFacilities({ isActive: true });
  }

  if (!facilities || facilities.length === 0) {
    throw new AppError('No available medical facilities found in the system', 404);
  }

  const result = await geminiService.recommendFacility({
    triageLevel,
    symptoms,
    facilities,
  });

  return sendSuccess(res, result, 'Facility recommendation generated', 200);
});
