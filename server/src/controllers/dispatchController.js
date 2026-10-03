import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as dispatchService from '../services/dispatchService.js';

export const createDispatch = asyncHandler(async (req, res) => {
  const dispatch = await dispatchService.createDispatch(req.body);
  return sendSuccess(res, dispatch, 'Dispatch created successfully', 201);
});

export const getDispatches = asyncHandler(async (req, res) => {
  const dispatches = await dispatchService.getAllDispatches(req.query);
  return sendSuccess(res, dispatches, 'Dispatches retrieved successfully', 200);
});

export const getDispatchById = asyncHandler(async (req, res) => {
  const dispatch = await dispatchService.getDispatchById(req.params.id);
  return sendSuccess(res, dispatch, 'Dispatch details retrieved', 200);
});

export const updateDispatchStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const dispatch = await dispatchService.updateDispatchStatus(req.params.id, status);
  return sendSuccess(res, dispatch, `Dispatch status updated to ${status}`, 200);
});

export const assignDispatch = asyncHandler(async (req, res) => {
  const { driverId, facilityId } = req.body;
  const dispatch = await dispatchService.assignDispatch(req.params.id, { driverId, facilityId });
  return sendSuccess(res, dispatch, 'Dispatch assignment updated', 200);
});
