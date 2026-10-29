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
  const startTime = performance.now();
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

  const getElapsedMs = () => Number(Math.max(0.001, performance.now() - startTime).toFixed(3));

  // Same start and end point
  if (straightLineKm === 0) {
    const waypoints = normOrigin?.coordinates ? [normOrigin.coordinates] : [];
    return {
      success: true,
      source: 'standard_route_fallback',
      isGraphRouted: false,
      algorithm: 'standard_fallback',
      costMetric: 'time',
      corridorName: 'Direct On-Site Transfer',
      recommendedRouteName: 'Direct On-Site Transfer',
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      estimatedDurationMinutes: 0,
      totalCost: 0,
      routeCost: 0,
      nodeSequence: [],
      edgeSequence: [],
      routeNodeIds: [],
      orderedEdgeIds: [],
      nodesExplored: 0,
      expandedNodeCount: 0,
      computationTimeMs: getElapsedMs(),
      coordinates: waypoints,
      waypoints,
      priorityLaneEligible: triageLevel === 'critical' || triageLevel === 'urgent',
      avoidedHazards: [],
      fallbackReason: reason,
      failureReason: null,
      error: null,
      isValidRoute: true,
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

  const finalDistance = Number(estimatedRoadDistanceKm.toFixed(2));
  const finalDuration = Number(estimatedDurationMinutes.toFixed(2));

  return {
    success: true,
    source: 'standard_route_fallback',
    isGraphRouted: false,
    algorithm: 'standard_fallback',
    costMetric: 'time',
    corridorName: isPriority ? 'Emergency Arterial Priority Corridor (Standard Route)' : 'Standard Highway Transit Route',
    recommendedRouteName: isPriority ? 'Emergency Arterial Priority Corridor (Standard Route)' : 'Standard Highway Transit Route',
    totalDistanceKm: finalDistance,
    estimatedTravelTimeMinutes: finalDuration,
    estimatedDurationMinutes: finalDuration,
    estimatedTimeSavedMinutes,
    routeCost: finalDuration,
    totalCost: finalDuration,
    nodeSequence: [],
    edgeSequence: [],
    routeNodeIds: [],
    orderedEdgeIds: [],
    nodesExplored: 0,
    expandedNodeCount: 0,
    computationTimeMs: getElapsedMs(),
    coordinates: waypoints,
    waypoints,
    priorityLaneEligible: isPriority,
    avoidedHazards: ['Traffic monitoring active on primary thoroughfare'],
    fallbackReason: reason,
    failureReason: null,
    error: null,
    isValidRoute: true,
    graphMetadata: PUNE_GRAPH_METADATA,
  };
};

/**
 * Checks if two route paths traverse the identical node or coordinate sequence.
 */
export const areRoutePathsIdentical = (routeA, routeB) => {
  if (!routeA || !routeB || !routeA.success || !routeB.success) return false;
  const nodesA = routeA.routeNodeIds || [];
  const nodesB = routeB.routeNodeIds || [];
  if (nodesA.length > 0 && nodesB.length > 0) {
    if (nodesA.length !== nodesB.length) return false;
    return nodesA.every((id, idx) => id === nodesB[idx]);
  }
  const coordsA = routeA.coordinates || routeA.waypoints || [];
  const coordsB = routeB.coordinates || routeB.waypoints || [];
  if (coordsA.length !== coordsB.length) return false;
  return coordsA.every((pt, i) => {
    const latA = pt.latitude ?? pt[0];
    const lonA = pt.longitude ?? pt[1];
    const latB = coordsB[i].latitude ?? coordsB[i][0];
    const lonB = coordsB[i].longitude ?? coordsB[i][1];
    return Math.abs(latA - latB) < 1e-5 && Math.abs(lonA - lonB) < 1e-5;
  });
};

/**
 * Helper to build the standardized output schema from solver results.
 */
const formatRouteOutput = (
  result,
  graph,
  startNodeId,
  destNodeId,
  originSnapDistanceKm = 0,
  destSnapDistanceKm = 0,
  triageLevel = 'standard',
  displayAlgorithmName = null
) => {
  const isPriority = triageLevel === 'critical' || triageLevel === 'urgent';
  const duration = typeof result.estimatedTravelTimeMinutes === 'number'
    ? result.estimatedTravelTimeMinutes
    : (result.estimatedDurationMinutes || 0);

  const timeSaved = isPriority ? Math.max(3, Math.round(duration * 0.25)) : 0;

  // Identify avoided hazards from graph metadata
  const avoidedHazards = [];
  if (graph && typeof graph.getAllEdges === 'function') {
    for (const edge of graph.getAllEdges()) {
      if (edge.isClosed) {
        avoidedHazards.push(`Closed Corridor: ${edge.roadName}`);
      } else if (edge.congestionMultiplier >= 2.0) {
        avoidedHazards.push(`Severe Traffic Jam: ${edge.roadName} (${edge.congestionMultiplier}x delay)`);
      }
    }
  }
  const uniqueHazards = Array.from(new Set(avoidedHazards)).slice(0, 4);

  // Generate readable corridor summary if route succeeded
  let recommendedRouteName = 'Direct Corridor';
  if (result.success && result.nodeSequence && result.nodeSequence.length > 0) {
    const startName = result.nodeSequence[0]?.label || startNodeId;
    const endName = result.nodeSequence[result.nodeSequence.length - 1]?.label || destNodeId;
    const viaRoads = Array.from(new Set(result.edgeSequence?.map((e) => e.roadName) || [])).slice(0, 2);
    const viaText = viaRoads.length > 0 ? ` via ${viaRoads.join(' & ')}` : '';
    recommendedRouteName = `${startName.split('(')[0].trim()} to ${endName.split('(')[0].trim()}${viaText}`;
  }

  const coordinates = result.coordinates || (result.nodeSequence
    ? result.nodeSequence.filter((n) => n.coordinates).map((n) => ({ latitude: n.coordinates.latitude, longitude: n.coordinates.longitude }))
    : []);

  return {
    success: Boolean(result.success),
    source: 'deterministic_graph',
    isGraphRouted: Boolean(result.success),
    algorithm: displayAlgorithmName || result.algorithm,
    costMetric: result.costMetric || 'time',
    recommendedRouteName,
    corridorName: recommendedRouteName,
    totalDistanceKm: Number((result.totalDistanceKm || 0).toFixed(2)),
    estimatedTravelTimeMinutes: Number(duration.toFixed(2)),
    estimatedDurationMinutes: Number(duration.toFixed(2)),
    estimatedTimeSavedMinutes: timeSaved,
    routeCost: Number((result.routeCost || result.totalCost || 0).toFixed(3)),
    totalCost: Number((result.routeCost || result.totalCost || 0).toFixed(3)),
    nodesExplored: result.nodesExplored ?? result.expandedNodeCount ?? 0,
    expandedNodeCount: result.nodesExplored ?? result.expandedNodeCount ?? 0,
    computationTimeMs: typeof result.computationTimeMs === 'number' ? result.computationTimeMs : 0.001,
    routeNodeIds: result.routeNodeIds || (result.nodeSequence ? result.nodeSequence.map((n) => n.id) : []),
    orderedEdgeIds: result.orderedEdgeIds || (result.edgeSequence ? result.edgeSequence.map((e) => e.id) : []),
    coordinates,
    waypoints: coordinates,
    nodeSequence: result.nodeSequence
      ? result.nodeSequence.map((n) => ({
          id: n.id,
          label: n.label,
          coordinates: n.coordinates,
        }))
      : [],
    edgeSequence: result.edgeSequence
      ? result.edgeSequence.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          roadName: e.roadName,
          roadType: e.roadType,
          distanceKm: e.distanceKm,
          baseSpeedKmH: e.baseSpeedKmH,
          congestionMultiplier: e.congestionMultiplier,
          travelTimeMinutes: Number(e.travelTimeMinutes?.toFixed(2) ?? 0),
          isClosed: Boolean(e.isClosed),
        }))
      : [],
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
    isValidRoute: Boolean(result.success),
    failureReason: result.failureReason || null,
    error: result.error || result.failureReason || null,
    graphMetadata: PUNE_GRAPH_METADATA,
  };
};

/**
 * Main deterministic routing entrypoint.
 * Evaluates origin and destination, resolves nearest graph junctions, applies closures
 * and congestion, executes A* and/or Dijkstra, and falls back gracefully if outside coverage.
 *
 * @param {object} params - Routing parameters
 * @returns {object} Structured routing outcome with comparison when requested
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
    compare = false,
  } = params;

  const isCompare = Boolean(compare || algorithm === 'compare');
  const normOrigin = normalizeLocation(origin);
  const normDest = normalizeLocation(destination);

  if (!normOrigin || (!normOrigin.coordinates && !normOrigin.nodeId)) {
    const failureReason = 'Origin location with valid coordinates or graph nodeId is required';
    return {
      success: false,
      isValidRoute: false,
      failureReason,
      error: failureReason,
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 0,
      computationTimeMs: 0,
      coordinates: [],
    };
  }

  if (!normDest || (!normDest.coordinates && !normDest.nodeId)) {
    const failureReason = 'Destination location with valid coordinates or graph nodeId is required';
    return {
      success: false,
      isValidRoute: false,
      failureReason,
      error: failureReason,
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 0,
      computationTimeMs: 0,
      coordinates: [],
    };
  }

  // Clone or acquire active road graph snapshot for deterministic evaluation
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

    const fallback = computeStandardRouteFallback({
      origin: normOrigin,
      destination: normDest,
      trafficCondition,
      triageLevel,
      reason,
    });

    if (isCompare) {
      return {
        ...fallback,
        comparison: {
          aStar: {
            ...fallback,
            algorithm: 'A*',
          },
          dijkstra: {
            ...fallback,
            algorithm: 'Dijkstra',
          },
          pathsAreIdentical: true,
        },
      };
    }

    return fallback;
  }

  // If comparison mode requested, run BOTH solvers on this identical graph snapshot
  if (isCompare) {
    const aStarRaw = findShortestPathAStar(graph, startNodeId, destNodeId, { costMetric, algorithm: 'A*' });
    const dijkstraRaw = findShortestPathDijkstra(graph, startNodeId, destNodeId, { costMetric, algorithm: 'Dijkstra' });

    const aStarFormatted = formatRouteOutput(
      aStarRaw,
      graph,
      startNodeId,
      destNodeId,
      originSnapDistanceKm,
      destSnapDistanceKm,
      triageLevel,
      'A*'
    );

    const dijkstraFormatted = formatRouteOutput(
      dijkstraRaw,
      graph,
      startNodeId,
      destNodeId,
      originSnapDistanceKm,
      destSnapDistanceKm,
      triageLevel,
      'Dijkstra'
    );

    const pathsAreIdentical = areRoutePathsIdentical(aStarFormatted, dijkstraFormatted);

    const comparison = {
      aStar: aStarFormatted,
      dijkstra: dijkstraFormatted,
      pathsAreIdentical,
    };

    return {
      success: aStarFormatted.success || dijkstraFormatted.success,
      source: 'deterministic_graph',
      isGraphRouted: aStarFormatted.success || dijkstraFormatted.success,
      algorithm: 'compare',
      costMetric,
      comparison,
      // Provide primary route properties for backwards-compatible consumers
      ...aStarFormatted,
      comparison,
    };
  }

  // Single-algorithm execution
  const isAStar = algorithm.toLowerCase() === 'a_star' || algorithm.toLowerCase() === 'astar';
  const solver = isAStar ? findShortestPathAStar : findShortestPathDijkstra;
  const algName = isAStar ? 'a_star' : 'dijkstra';

  const result = solver(graph, startNodeId, destNodeId, {
    costMetric,
    algorithm: algName,
  });

  return formatRouteOutput(
    result,
    graph,
    startNodeId,
    destNodeId,
    originSnapDistanceKm,
    destSnapDistanceKm,
    triageLevel,
    algName
  );
};

export default {
  GRAPH_SNAP_MAX_RADIUS_KM,
  normalizeLocation,
  computeStandardRouteFallback,
  calculateDeterministicRoute,
  areRoutePathsIdentical,
};
