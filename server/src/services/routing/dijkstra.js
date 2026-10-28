import { MinPriorityQueue } from './priorityQueue.js';
import { computeEdgeCost } from './routeCost.js';

/**
 * Dijkstra's Algorithm: Baseline single-source shortest path solver.
 * Utilizes a binary MinPriorityQueue for O((V + E) log V) efficiency.
 *
 * @param {import('./roadGraph.js').RoadGraph} graph - Directed road graph
 * @param {string} startNodeId - Source node ID
 * @param {string} destinationNodeId - Target node ID
 * @param {object} options - Configuration options
 * @param {string} options.costMetric - 'time' (default) or 'distance'
 * @returns {object} Standardized routing result
 */
export const findShortestPathDijkstra = (
  graph,
  startNodeId,
  destinationNodeId,
  options = {}
) => {
  const costMetric = options.costMetric || 'time';
  const startId = String(startNodeId);
  const destId = String(destinationNodeId);

  // Validation: Graph existence
  if (!graph || typeof graph.hasNode !== 'function') {
    return {
      success: false,
      algorithm: 'dijkstra',
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
      algorithm: 'dijkstra',
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
      algorithm: 'dijkstra',
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
      algorithm: 'dijkstra',
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

  const distances = new Map(); // nodeId -> shortest known cost
  const previous = new Map(); // nodeId -> { fromNodeId, edge }
  const visited = new Set();
  const pq = new MinPriorityQueue();

  distances.set(startId, 0);
  pq.push(startId, 0);

  let expandedNodeCount = 0;
  let destinationFound = false;

  while (!pq.isEmpty()) {
    const currentId = pq.pop();

    if (visited.has(currentId)) continue;
    visited.add(currentId);
    expandedNodeCount++;

    const currentCost = distances.get(currentId);

    // Target reached - since Dijkstra expands in non-decreasing cost order,
    // this path is guaranteed to be optimal.
    if (currentId === destId) {
      destinationFound = true;
      break;
    }

    const outgoingEdges = graph.getOutgoingEdges(currentId);
    for (const edge of outgoingEdges) {
      // Skip closed edges
      if (edge.isClosed) continue;

      const edgeCost = computeEdgeCost(edge, costMetric);
      if (edgeCost === Infinity || isNaN(edgeCost)) continue;

      const newCost = currentCost + edgeCost;
      const neighborId = edge.target;
      const bestKnownNeighborCost = distances.has(neighborId)
        ? distances.get(neighborId)
        : Infinity;

      if (newCost < bestKnownNeighborCost) {
        distances.set(neighborId, newCost);
        previous.set(neighborId, { fromNodeId: currentId, edge });
        pq.push(neighborId, newCost);
      }
    }
  }

  if (!destinationFound) {
    return {
      success: false,
      algorithm: 'dijkstra',
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

  // Reconstruct path from destination backwards to start
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

  // Compute aggregate metrics
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
    algorithm: 'dijkstra',
    costMetric,
    nodeSequence,
    edgeSequence,
    totalDistanceKm: Number(totalDistanceKm.toFixed(3)),
    estimatedDurationMinutes: Number(estimatedDurationMinutes.toFixed(2)),
    totalCost: Number(distances.get(destId).toFixed(3)),
    expandedNodeCount,
    isValidRoute: true,
    failureReason: null,
    waypoints,
  };
};

export default findShortestPathDijkstra;
