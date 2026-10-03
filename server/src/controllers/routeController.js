import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as routeService from '../services/routeService.js';

export const createRouteLog = asyncHandler(async (req, res) => {
  const route = await routeService.createRouteLog(req.body);
  return sendSuccess(res, route, 'Route log recorded successfully', 201);
});

export const getRoutesByDispatch = asyncHandler(async (req, res) => {
  const routes = await routeService.getRoutesByDispatch(req.params.dispatchId);
  return sendSuccess(res, routes, 'Route logs retrieved', 200);
});

export const getRouteById = asyncHandler(async (req, res) => {
  const route = await routeService.getRouteById(req.params.id);
  return sendSuccess(res, route, 'Route log details retrieved', 200);
});
