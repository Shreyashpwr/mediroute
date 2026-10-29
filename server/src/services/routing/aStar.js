import { MinPriorityQueue } from './priorityQueue.js';
import { computeEdgeCost, createAdmissibleHeuristic, DEFAULT_MAX_NETWORK_SPEED_KMH } from './routeCost.js';

/**
 * A* Search Algorithm: Heuristic-directed optimal shortest path solver.
 * Uses an admissible and consistent geographic heuristic (Haversine / max-speed ceiling)
 * to guarantee optimal cost while minimizing node expansions.
 *
 * @param {import('./roadGraph.js').RoadGraph} graph - Directed road graph
 * @param {string} startNodeId - Source node ID
 * @param {string} destinationNodeId - Target node ID
 * @param {object} options - Configuration options
 * @param {string} options.costMetric - 'time' (default) or 'distance'
 * @param {number} options.maxNetworkSpeedKmH - Vehicle speed upper bound for heuristic
 * @returns {object} Standardized routing result
 */
export const findShortestPathAStar = (
  graph,
  startNodeId,
  destinationNodeId,
  options = {}
) => {
  const startTime = performance.now();
  const costMetric = options.costMetric || 'time';
  const startId = String(startNodeId);
  const destId = String(destinationNodeId);
  const maxSpeed = options.maxNetworkSpeedKmH || DEFAULT_MAX_NETWORK_SPEED_KMH;
  const algorithm = options.algorithm || 'a_star';

  const getComputationTimeMs = () => {
    const elapsed = performance.now() - startTime;
    return Number(Math.max(0.001, elapsed).toFixed(3));
  };

  // Validation: Graph existence
  if (!graph || typeof graph.hasNode !== 'function') {
    const failureReason = 'Invalid road graph instance provided';
    return {
      success: false,
      algorithm,
      costMetric,
      routeNodeIds: [],
      orderedEdgeIds: [],
      coordinates: [],
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 0,
      computationTimeMs: getComputationTimeMs(),
      routeCost: Infinity,
      failureReason,
      error: failureReason,
      // Backwards-compatibility aliases:
      nodeSequence: [],
      edgeSequence: [],
      waypoints: [],
      totalCost: Infinity,
      expandedNodeCount: 0,
      estimatedDurationMinutes: 0,
      isValidRoute: false,
    };
  }

  // Validation: Start & destination presence
  if (!graph.hasNode(startId)) {
    const failureReason = `Origin node "${startId}" does not exist in graph`;
    return {
      success: false,
      algorithm,
      costMetric,
      routeNodeIds: [],
      orderedEdgeIds: [],
      coordinates: [],
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 0,
      computationTimeMs: getComputationTimeMs(),
      routeCost: Infinity,
      failureReason,
      error: failureReason,
      nodeSequence: [],
      edgeSequence: [],
      waypoints: [],
      totalCost: Infinity,
      expandedNodeCount: 0,
      estimatedDurationMinutes: 0,
      isValidRoute: false,
    };
  }

  if (!graph.hasNode(destId)) {
    const failureReason = `Destination node "${destId}" does not exist in graph`;
    return {
      success: false,
      algorithm,
      costMetric,
      routeNodeIds: [],
      orderedEdgeIds: [],
      coordinates: [],
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 0,
      computationTimeMs: getComputationTimeMs(),
      routeCost: Infinity,
      failureReason,
      error: failureReason,
      nodeSequence: [],
      edgeSequence: [],
      waypoints: [],
      totalCost: Infinity,
      expandedNodeCount: 0,
      estimatedDurationMinutes: 0,
      isValidRoute: false,
    };
  }

  // Edge case: Start equals Destination
  if (startId === destId) {
    const startNode = graph.getNode(startId);
    const coords = startNode.coordinates ? [{ latitude: startNode.coordinates.latitude, longitude: startNode.coordinates.longitude }] : [];
    return {
      success: true,
      algorithm,
      costMetric,
      routeNodeIds: [startId],
      orderedEdgeIds: [],
      coordinates: coords,
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored: 1,
      computationTimeMs: getComputationTimeMs(),
      routeCost: 0,
      failureReason: null,
      error: null,
      nodeSequence: [startNode],
      edgeSequence: [],
      waypoints: coords,
      totalCost: 0,
      expandedNodeCount: 1,
      estimatedDurationMinutes: 0,
      isValidRoute: true,
    };
  }

  const destNode = graph.getNode(destId);
  const heuristic = createAdmissibleHeuristic(destNode, costMetric, maxSpeed);

  const gScore = new Map(); // nodeId -> exact cost from start to node
  const fScore = new Map(); // nodeId -> gScore + heuristic
  const previous = new Map(); // nodeId -> { fromNodeId, edge }
  const closedSet = new Set();
  const pq = new MinPriorityQueue();

  gScore.set(startId, 0);
  const initialH = heuristic(graph.getNode(startId));
  fScore.set(startId, initialH);
  pq.push(startId, initialH);

  let nodesExplored = 0;
  let destinationFound = false;

  while (!pq.isEmpty()) {
    const currentId = pq.pop();

    if (closedSet.has(currentId)) continue;
    closedSet.add(currentId);
    nodesExplored++;

    // Target reached - with an admissible, consistent heuristic,
    // this path is mathematically guaranteed to be optimal.
    if (currentId === destId) {
      destinationFound = true;
      break;
    }

    const currentG = gScore.get(currentId);
    const outgoingEdges = graph.getOutgoingEdges(currentId);

    for (const edge of outgoingEdges) {
      // Closed road avoidance
      if (edge.isClosed) continue;

      const edgeCost = computeEdgeCost(edge, costMetric);
      if (edgeCost === Infinity || isNaN(edgeCost)) continue;

      const neighborId = edge.target;
      if (closedSet.has(neighborId)) continue;

      const tentativeG = currentG + edgeCost;
      const bestKnownG = gScore.has(neighborId) ? gScore.get(neighborId) : Infinity;

      if (tentativeG < bestKnownG) {
        gScore.set(neighborId, tentativeG);
        previous.set(neighborId, { fromNodeId: currentId, edge });

        const h = heuristic(graph.getNode(neighborId));
        const f = tentativeG + h;
        fScore.set(neighborId, f);
        pq.push(neighborId, f);
      }
    }
  }

  if (!destinationFound) {
    const failureReason = `Destination "${destId}" is unreachable from origin "${startId}" (disconnected network or closed roads)`;
    return {
      success: false,
      algorithm,
      costMetric,
      routeNodeIds: [],
      orderedEdgeIds: [],
      coordinates: [],
      totalDistanceKm: 0,
      estimatedTravelTimeMinutes: 0,
      nodesExplored,
      computationTimeMs: getComputationTimeMs(),
      routeCost: Infinity,
      failureReason,
      error: failureReason,
      nodeSequence: [],
      edgeSequence: [],
      waypoints: [],
      totalCost: Infinity,
      expandedNodeCount: nodesExplored,
      estimatedDurationMinutes: 0,
      isValidRoute: false,
    };
  }

  // Reconstruct path
  const nodeSequence = [];
  const edgeSequence = [];
  let curr = destId;

  while (curr !== startId) {
    const prevEntry = previous.get(curr);
    if (!prevEntry) break;
    nodeSequence.unshift(graph.getNode(curr));
    edgeSequence.unshift(prevEntry.edge);
    curr = prevEntry.fromNodeId;
  }
  nodeSequence.unshift(graph.getNode(startId));

  let totalDistanceKm = 0;
  let estimatedTravelTimeMinutes = 0;

  for (const edge of edgeSequence) {
    totalDistanceKm += edge.distanceKm;
    estimatedTravelTimeMinutes += edge.travelTimeMinutes;
  }

  const coordinates = nodeSequence
    .filter((n) => n.coordinates)
    .map((n) => ({ latitude: n.coordinates.latitude, longitude: n.coordinates.longitude }));

  const routeNodeIds = nodeSequence.map((n) => n.id);
  const orderedEdgeIds = edgeSequence.map((e) => e.id);
  const finalCost = Number(gScore.get(destId).toFixed(3));
  const finalDistance = Number(totalDistanceKm.toFixed(3));
  const finalDuration = Number(estimatedTravelTimeMinutes.toFixed(2));

  return {
    success: true,
    algorithm,
    costMetric,
    routeNodeIds,
    orderedEdgeIds,
    coordinates,
    totalDistanceKm: finalDistance,
    estimatedTravelTimeMinutes: finalDuration,
    nodesExplored,
    computationTimeMs: getComputationTimeMs(),
    routeCost: finalCost,
    failureReason: null,
    error: null,
    // Backwards-compatibility aliases:
    nodeSequence,
    edgeSequence,
    waypoints: coordinates,
    totalCost: finalCost,
    expandedNodeCount: nodesExplored,
    estimatedDurationMinutes: finalDuration,
    isValidRoute: true,
  };
};

export default findShortestPathAStar;
