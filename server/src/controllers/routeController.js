import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as routeService from '../services/routeService.js';
import { emitRoadNetworkUpdate } from '../services/realtime/socketManager.js';

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

export const planRoute = asyncHandler(async (req, res) => {
  const routePlan = await routeService.planDeterministicRoute(req.body);
  return sendSuccess(res, routePlan, 'Deterministic route calculated successfully', 200);
});

export const getRoadNetworkGraph = asyncHandler(async (req, res) => {
  const graphData = await routeService.getRoadNetworkGraph();
  return sendSuccess(res, graphData, 'Road network graph topology retrieved', 200);
});

export const updateRoadCondition = asyncHandler(async (req, res) => {
  const result = await routeService.updateRoadCondition(req.body);
  emitRoadNetworkUpdate(result);
  return sendSuccess(res, result, 'Road network condition updated and broadcast', 200);
});
