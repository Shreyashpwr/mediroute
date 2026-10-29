import RouteLog from '../models/RouteLog.js';
import Dispatch from '../models/Dispatch.js';
import AppError from '../utils/appError.js';
import { calculateDeterministicRoute } from './routing/graphAdapter.js';
import { getPuneRoadGraph, PUNE_GRAPH_METADATA } from './routing/puneRoadGraph.js';

export const createRouteLog = async (data) => {
  // Verify dispatch exists
  const dispatch = await Dispatch.findById(data.dispatch);
  if (!dispatch) {
    throw new AppError(`Referenced dispatch not found with id: ${data.dispatch}`, 404);
  }

  return await RouteLog.create(data);
};

export const getRoutesByDispatch = async (dispatchId) => {
  const routes = await RouteLog.find({ dispatch: dispatchId })
    .populate('dispatch', 'dispatchNumber patientName triageLevel status')
    .sort({ createdAt: -1 });

  return routes;
};

export const getRouteById = async (id) => {
  const route = await RouteLog.findById(id).populate('dispatch');
  if (!route) {
    throw new AppError(`Route log not found with id: ${id}`, 404);
  }
  return route;
};

/**
 * Executes deterministic graph routing using A* or Dijkstra.
 */
export const planDeterministicRoute = async (params) => {
  const result = calculateDeterministicRoute(params);
  const isCompare = Boolean(params?.compare || params?.algorithm === 'compare');
  if (!result.success && !result.isGraphRouted && result.source !== 'standard_route_fallback' && !isCompare) {
    throw new AppError(result.failureReason || 'Routing plan could not be computed', 400);
  }
  return result;
};

/**
 * Updates simulated road network condition (closure or congestion).
 */
export const updateRoadCondition = async ({ edgeId, isClosed, congestionMultiplier, reason }) => {
  const graph = getPuneRoadGraph();
  const edge = graph.getEdge(edgeId);
  if (!edge) {
    throw new AppError(`Edge with id '${edgeId}' not found in road network`, 404);
  }
  if (typeof isClosed === 'boolean') {
    graph.setEdgeClosure(edgeId, isClosed);
  }
  if (typeof congestionMultiplier === 'number') {
    graph.setEdgeCongestion(edgeId, congestionMultiplier);
  }
  return {
    edgeId: edge.id,
    roadName: edge.roadName,
    isClosed: edge.isClosed,
    congestionMultiplier: edge.congestionMultiplier,
    reason: reason || 'Simulated network update',
  };
};

/**
 * Returns road graph network topology for control room inspection.
 */
export const getRoadNetworkGraph = async () => {
  const graph = getPuneRoadGraph();
  return {
    metadata: PUNE_GRAPH_METADATA,
    nodes: graph.getNodes(),
    edges: graph.getAllEdges(),
  };
};


