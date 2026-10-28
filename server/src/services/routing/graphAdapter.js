import { getPuneRoadGraph, PUNE_GRAPH_METADATA } from './puneRoadGraph.js';
import { findShortestPathAStar } from './aStar.js';
import { findShortestPathDijkstra } from './dijkstra.js';
import { haversineDistanceKm } from './routeCost.js';

export const GRAPH_SNAP_MAX_RADIUS_KM = 35; // Maximum radius to snap coordinates to seeded demo graph

/**
 * Normalizes input location to extract coordinates and descriptive address.
 */
export const normalizeLocation = (loc) => {
  if (!loc) return null;
  if (typeof loc === 'string') {
    return { address: loc, coordinates: null };
  }
  const lat = Number(loc.latitude ?? loc.lat ?? loc.coordinates?.latitude ?? loc.coordinates?.[1]);
  const lon = Number(loc.longitude ?? loc.lng ?? loc.lon ?? loc.coordinates?.longitude ?? loc.coordinates?.[0]);
  const hasCoords = !isNaN(lat) && !isNaN(lon);

  return {
    address: loc.address || loc.name || 'Location',
    coordinates: hasCoords ? { latitude: lat, longitude: lon } : null,
    nodeId: loc.nodeId || (typeof loc.id === 'string' && loc.id.startsWith('NODE_') ? loc.id : null),
  };
};

/**
 * Computes deterministic fallback route when outside graph coverage area.
 * Accurately estimates road distance via Haversine and urban tortuosity/circuity factor (1.28x).
 */
export const computeStandardRouteFallback = ({
  origin,
  destination,
  trafficCondition = 'moderate',
  triageLevel = 'standard',
  reason = 'Outside demonstration graph coverage area',
}) => {
  const normOrigin = normalizeLocation(origin);
  const normDest = normalizeLocation(destination);

  let straightLineKm = 5.0;
  if (normOrigin?.coordinates && normDest?.coordinates) {
    try {
      straightLineKm = haversineDistanceKm(normOrigin.coordinates, normDest.coordinates);
    } catch {
      straightLineKm = 5.0;
    }
  }

  // Same start and end point
  if (straightLineKm === 0) {
    return {
      success: true,
      source: 'standard_route_fallback',
      isGraphRouted: false,
      algorithm: 'standard_fallback',
      costMetric: 'time',
      corridorName: 'Direct On-Site Transfer',
      recommendedRouteName: 'Direct On-Site Transfer',
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: 0,
      nodeSequence: [],
      edgeSequence: [],
      expandedNodeCount: 0,
      waypoints: normOrigin?.coordinates ? [normOrigin.coordinates] : [],
      priorityLaneEligible: triageLevel === 'critical' || triageLevel === 'urgent',
      avoidedHazards: [],
      fallbackReason: reason,
      graphMetadata: PUNE_GRAPH_METADATA,
    };
  }

  // Realistic urban road circuity factor
  const estimatedRoadDistanceKm = Math.max(0.5, straightLineKm * 1.28);

  // Speed matrix based on traffic condition (km/h)
  const speedMap = {
    light: 45,
    moderate: 30,
    heavy: 18,
    severe: 12,
  };
  const baseSpeed = speedMap[trafficCondition] || 30;
  const isPriority = triageLevel === 'critical' || triageLevel === 'urgent';
  const effectiveSpeed = isPriority ? baseSpeed * 1.2 : baseSpeed;

  const estimatedDurationMinutes = (estimatedRoadDistanceKm / effectiveSpeed) * 60;
  const estimatedTimeSavedMinutes = isPriority ? Math.max(2, Math.round(estimatedDurationMinutes * 0.25)) : 0;

  // Waypoint interpolation
  const waypoints = [];
  if (normOrigin?.coordinates && normDest?.coordinates) {
    waypoints.push(normOrigin.coordinates);
    // Intermediate waypoint
    waypoints.push({
      latitude: Number(((normOrigin.coordinates.latitude + normDest.coordinates.latitude) / 2).toFixed(6)),
      longitude: Number(((normOrigin.coordinates.longitude + normDest.coordinates.longitude) / 2).toFixed(6)),
    });
    waypoints.push(normDest.coordinates);
  }

  return {
    success: true,
    source: 'standard_route_fallback',
    isGraphRouted: false,
    algorithm: 'standard_fallback',
    costMetric: 'time',
    corridorName: isPriority ? 'Emergency Arterial Priority Corridor (Standard Route)' : 'Standard Highway Transit Route',
    recommendedRouteName: isPriority ? 'Emergency Arterial Priority Corridor (Standard Route)' : 'Standard Highway Transit Route',
    totalDistanceKm: Number(estimatedRoadDistanceKm.toFixed(2)),
    estimatedDurationMinutes: Number(estimatedDurationMinutes.toFixed(1)),
    estimatedTimeSavedMinutes,
    totalCost: Number(estimatedDurationMinutes.toFixed(1)),
    nodeSequence: [],
    edgeSequence: [],
    expandedNodeCount: 0,
    waypoints,
    priorityLaneEligible: isPriority,
    avoidedHazards: ['Traffic monitoring active on primary thoroughfare'],
    fallbackReason: reason,
    graphMetadata: PUNE_GRAPH_METADATA,
  };
};

/**
 * Main deterministic routing entrypoint.
 * Evaluates origin and destination, resolves nearest graph junctions, applies closures
 * and congestion, executes A* or Dijkstra, and falls back gracefully if outside coverage.
 *
 * @param {object} params - Routing parameters
 * @returns {object} Structured routing outcome
 */
export const calculateDeterministicRoute = (params = {}) => {
  const {
    origin,
    destination,
    algorithm = 'a_star',
    costMetric = 'time',
    graph: providedGraph,
    roadClosures = [],
    congestionOverrides = {},
    trafficCondition = 'moderate',
    triageLevel = 'standard',
    maxSnapRadiusKm = GRAPH_SNAP_MAX_RADIUS_KM,
  } = params;

  const normOrigin = normalizeLocation(origin);
  const normDest = normalizeLocation(destination);

  if (!normOrigin || (!normOrigin.coordinates && !normOrigin.nodeId)) {
    return {
      success: false,
      isValidRoute: false,
      failureReason: 'Origin location with valid coordinates or graph nodeId is required',
    };
  }

  if (!normDest || (!normDest.coordinates && !normDest.nodeId)) {
    return {
      success: false,
      isValidRoute: false,
      failureReason: 'Destination location with valid coordinates or graph nodeId is required',
    };
  }

  // Clone or acquire active road graph
  const baseGraph = providedGraph || getPuneRoadGraph();
  const graph = baseGraph.clone();

  // Apply optional road closures
  if (Array.isArray(roadClosures) && roadClosures.length > 0) {
    for (const closure of roadClosures) {
      if (typeof closure === 'string') {
        if (graph.getEdge(closure)) {
          graph.setEdgeClosure(closure, true);
        } else {
          graph.setRoadClosureByName(closure, true);
        }
      } else if (closure && closure.edgeId) {
        graph.setEdgeClosure(closure.edgeId, closure.isClosed !== false);
      }
    }
  }

  // Apply optional congestion factor overrides
  if (congestionOverrides && typeof congestionOverrides === 'object') {
    for (const [edgeId, mult] of Object.entries(congestionOverrides)) {
      if (graph.getEdge(edgeId)) {
        graph.setEdgeCongestion(edgeId, mult);
      }
    }
  }

  // Global traffic condition multiplier if no edge-specific overrides
  if (trafficCondition && trafficCondition !== 'light') {
    const multipliers = {
      moderate: 1.3,
      heavy: 1.8,
      severe: 2.6,
    };
    const globalMult = multipliers[trafficCondition] || 1.0;
    for (const edge of graph.getAllEdges()) {
      if (!congestionOverrides[edge.id]) {
        edge.congestionMultiplier = Number((edge.congestionMultiplier * globalMult).toFixed(2));
      }
    }
  }

  // Resolve start node
  let startNodeId = normOrigin.nodeId;
  let originSnapDistanceKm = 0;
  if (!startNodeId && normOrigin.coordinates) {
    const snap = graph.findNearestNode(normOrigin.coordinates, maxSnapRadiusKm);
    if (snap) {
      startNodeId = snap.node.id;
      originSnapDistanceKm = snap.distanceKm;
    }
  }

  // Resolve destination node
  let destNodeId = normDest.nodeId;
  let destSnapDistanceKm = 0;
  if (!destNodeId && normDest.coordinates) {
    const snap = graph.findNearestNode(normDest.coordinates, maxSnapRadiusKm);
    if (snap) {
      destNodeId = snap.node.id;
      destSnapDistanceKm = snap.distanceKm;
    }
  }

  // If outside graph bounds, trigger documented standard fallback
  if (!startNodeId || !destNodeId) {
    const reason = !startNodeId && !destNodeId
      ? 'Origin and destination are outside the Pune demonstration road graph coverage area'
      : !startNodeId
      ? 'Origin is outside the Pune demonstration road graph coverage area'
      : 'Destination is outside the Pune demonstration road graph coverage area';

    return computeStandardRouteFallback({
      origin: normOrigin,
      destination: normDest,
      trafficCondition,
      triageLevel,
      reason,
    });
  }

  // Execute selected deterministic algorithm
  const isAStar = algorithm.toLowerCase() === 'a_star' || algorithm.toLowerCase() === 'astar';
  const solver = isAStar ? findShortestPathAStar : findShortestPathDijkstra;

  const result = solver(graph, startNodeId, destNodeId, {
    costMetric,
  });

  // If graph pathfinding failed (e.g. closures broke connectivity)
  if (!result.isValidRoute) {
    return {
      success: false,
      source: 'deterministic_graph',
      isGraphRouted: false,
      algorithm: result.algorithm,
      costMetric,
      nodeSequence: [],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: Infinity,
      expandedNodeCount: result.expandedNodeCount,
      isValidRoute: false,
      failureReason: result.failureReason,
      graphMetadata: PUNE_GRAPH_METADATA,
    };
  }

  // Identify avoided hazards from graph metadata
  const avoidedHazards = [];
  for (const edge of graph.getAllEdges()) {
    if (edge.isClosed) {
      avoidedHazards.push(`Closed Corridor: ${edge.roadName}`);
    } else if (edge.congestionMultiplier >= 2.0) {
      avoidedHazards.push(`Severe Traffic Jam: ${edge.roadName} (${edge.congestionMultiplier}x delay)`);
    }
  }

  // Deduplicate avoided hazards
  const uniqueHazards = Array.from(new Set(avoidedHazards)).slice(0, 4);

  // Generate readable corridor summary
  const startName = result.nodeSequence[0]?.label || startNodeId;
  const endName = result.nodeSequence[result.nodeSequence.length - 1]?.label || destNodeId;
  const viaRoads = Array.from(new Set(result.edgeSequence.map((e) => e.roadName))).slice(0, 2);
  const viaText = viaRoads.length > 0 ? ` via ${viaRoads.join(' & ')}` : '';
  const recommendedRouteName = `${startName.split('(')[0].trim()} to ${endName.split('(')[0].trim()}${viaText}`;

  const isPriority = triageLevel === 'critical' || triageLevel === 'urgent';
  const timeSaved = isPriority ? Math.max(3, Math.round(result.estimatedDurationMinutes * 0.25)) : 0;

  return {
    success: true,
    source: 'deterministic_graph',
    isGraphRouted: true,
    algorithm: result.algorithm,
    costMetric: result.costMetric,
    recommendedRouteName,
    corridorName: recommendedRouteName,
    totalDistanceKm: result.totalDistanceKm,
    estimatedDurationMinutes: result.estimatedDurationMinutes,
    estimatedTimeSavedMinutes: timeSaved,
    totalCost: result.totalCost,
    expandedNodeCount: result.expandedNodeCount,
    nodeSequence: result.nodeSequence.map((n) => ({
      id: n.id,
      label: n.label,
      coordinates: n.coordinates,
    })),
    edgeSequence: result.edgeSequence.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      roadName: e.roadName,
      roadType: e.roadType,
      distanceKm: e.distanceKm,
      baseSpeedKmH: e.baseSpeedKmH,
      congestionMultiplier: e.congestionMultiplier,
      travelTimeMinutes: Number(e.travelTimeMinutes.toFixed(2)),
      isClosed: e.isClosed,
    })),
    waypoints: result.waypoints,
    priorityLaneEligible: isPriority,
    avoidedHazards: uniqueHazards,
    snappedOrigin: {
      nodeId: startNodeId,
      snapDistanceKm: Number(originSnapDistanceKm.toFixed(2)),
    },
    snappedDestination: {
      nodeId: destNodeId,
      snapDistanceKm: Number(destSnapDistanceKm.toFixed(2)),
    },
    isValidRoute: true,
    failureReason: null,
    graphMetadata: PUNE_GRAPH_METADATA,
  };
};

export default {
  GRAPH_SNAP_MAX_RADIUS_KM,
  normalizeLocation,
  computeStandardRouteFallback,
  calculateDeterministicRoute,
};
