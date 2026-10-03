import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as facilityService from '../services/facilityService.js';

export const createFacility = asyncHandler(async (req, res) => {
  const facility = await facilityService.createFacility(req.body);
  return sendSuccess(res, facility, 'Facility created successfully', 201);
});

export const getFacilities = asyncHandler(async (req, res) => {
  const facilities = await facilityService.getAllFacilities(req.query);
  return sendSuccess(res, facilities, 'Facilities retrieved successfully', 200);
});

export const getFacilityById = asyncHandler(async (req, res) => {
  const facility = await facilityService.getFacilityById(req.params.id);
  return sendSuccess(res, facility, 'Facility details retrieved', 200);
});

export const updateFacility = asyncHandler(async (req, res) => {
  const facility = await facilityService.updateFacility(req.params.id, req.body);
  return sendSuccess(res, facility, 'Facility updated successfully', 200);
});

export const deleteFacility = asyncHandler(async (req, res) => {
  await facilityService.deleteFacility(req.params.id);
  return sendSuccess(res, null, 'Facility deleted successfully', 200);
});
