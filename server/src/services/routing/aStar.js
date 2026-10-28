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
  const costMetric = options.costMetric || 'time';
  const startId = String(startNodeId);
  const destId = String(destinationNodeId);
  const maxSpeed = options.maxNetworkSpeedKmH || DEFAULT_MAX_NETWORK_SPEED_KMH;

  // Validation: Graph existence
  if (!graph || typeof graph.hasNode !== 'function') {
    return {
      success: false,
      algorithm: 'a_star',
      costMetric,
      nodeSequence: [],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: Infinity,
      expandedNodeCount: 0,
      isValidRoute: false,
      failureReason: 'Invalid road graph instance provided',
    };
  }

  // Validation: Start & destination presence
  if (!graph.hasNode(startId)) {
    return {
      success: false,
      algorithm: 'a_star',
      costMetric,
      nodeSequence: [],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: Infinity,
      expandedNodeCount: 0,
      isValidRoute: false,
      failureReason: `Origin node "${startId}" does not exist in graph`,
    };
  }

  if (!graph.hasNode(destId)) {
    return {
      success: false,
      algorithm: 'a_star',
      costMetric,
      nodeSequence: [],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: Infinity,
      expandedNodeCount: 0,
      isValidRoute: false,
      failureReason: `Destination node "${destId}" does not exist in graph`,
    };
  }

  // Edge case: Start equals Destination
  if (startId === destId) {
    const startNode = graph.getNode(startId);
    return {
      success: true,
      algorithm: 'a_star',
      costMetric,
      nodeSequence: [startNode],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: 0,
      expandedNodeCount: 1,
      isValidRoute: true,
      failureReason: null,
      waypoints: startNode.coordinates ? [{ ...startNode.coordinates }] : [],
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

  let expandedNodeCount = 0;
  let destinationFound = false;

  while (!pq.isEmpty()) {
    const currentId = pq.pop();

    if (closedSet.has(currentId)) continue;
    closedSet.add(currentId);
    expandedNodeCount++;

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
    return {
      success: false,
      algorithm: 'a_star',
      costMetric,
      nodeSequence: [],
      edgeSequence: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      totalCost: Infinity,
      expandedNodeCount,
      isValidRoute: false,
      failureReason: `Destination "${destId}" is unreachable from origin "${startId}" (disconnected network or closed roads)`,
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
  let estimatedDurationMinutes = 0;

  for (const edge of edgeSequence) {
    totalDistanceKm += edge.distanceKm;
    estimatedDurationMinutes += edge.travelTimeMinutes;
  }

  const waypoints = nodeSequence
    .filter((n) => n.coordinates)
    .map((n) => ({ ...n.coordinates }));

  return {
    success: true,
    algorithm: 'a_star',
    costMetric,
    nodeSequence,
    edgeSequence,
    totalDistanceKm: Number(totalDistanceKm.toFixed(3)),
    estimatedDurationMinutes: Number(estimatedDurationMinutes.toFixed(2)),
    totalCost: Number(gScore.get(destId).toFixed(3)),
    expandedNodeCount,
    isValidRoute: true,
    failureReason: null,
    waypoints,
  };
};

export default findShortestPathAStar;
