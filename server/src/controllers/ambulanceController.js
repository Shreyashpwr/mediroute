import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as ambulanceService from '../services/ambulanceService.js';

export const getAmbulances = asyncHandler(async (req, res) => {
  const ambulances = await ambulanceService.getAllAmbulances(req.query);
  return sendSuccess(res, ambulances, 'Ambulances retrieved successfully', 200);
});

export const getAmbulanceById = asyncHandler(async (req, res) => {
  const ambulance = await ambulanceService.getAmbulanceById(req.params.id);
  return sendSuccess(res, ambulance, 'Ambulance details retrieved', 200);
});

export const createAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await ambulanceService.createAmbulance(req.body);
  return sendSuccess(res, ambulance, 'Ambulance registered successfully', 201);
});

export const updateAmbulanceStatus = asyncHandler(async (req, res) => {
  const ambulance = await ambulanceService.updateAmbulanceStatus(req.params.id, req.body);
  return sendSuccess(res, ambulance, 'Ambulance status updated', 200);
});

export const updateAmbulanceLocation = asyncHandler(async (req, res) => {
  const ambulance = await ambulanceService.updateAmbulanceLocation(req.params.id, req.body);
  return sendSuccess(res, ambulance, 'Ambulance location updated', 200);
});
