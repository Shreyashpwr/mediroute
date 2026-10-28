import { MinPriorityQueue } from './src/services/routing/priorityQueue.js';
import { RoadGraph } from './src/services/routing/roadGraph.js';
import { findShortestPathDijkstra } from './src/services/routing/dijkstra.js';
import { findShortestPathAStar } from './src/services/routing/aStar.js';
import { haversineDistanceKm, computeEdgeCost, computeEffectiveSpeedKmH, createAdmissibleHeuristic } from './src/services/routing/routeCost.js';
import { createPuneRoadGraph, getPuneRoadGraph } from './src/services/routing/puneRoadGraph.js';
import { calculateDeterministicRoute } from './src/services/routing/graphAdapter.js';
import { optimizeRoute } from './src/services/geminiService.js';

console.log('======================================================================');
console.log('       MEDIROUTE DETERMINISTIC ROUTING ENGINE TEST SUITE');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✓ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failCount++;
  }
}

// ============================================================================
// TEST 1: PRIORITY QUEUE / BINARY HEAP CORRECTNESS
// ============================================================================
console.log('--- 1. PRIORITY QUEUE / BINARY HEAP CORRECTNESS ---');
try {
  const pq = new MinPriorityQueue();
  assert(pq.isEmpty() && pq.size() === 0, 'MinPriorityQueue initializes empty');

  // Push unordered elements
  pq.push('task_c', 15.5);
  pq.push('task_a', 2.1);
  pq.push('task_d', 42.0);
  pq.push('task_b', 8.7);
  pq.push('task_tie1', 8.7);

  assert(pq.size() === 5, 'Queue tracks size correctly after 5 pushes', `Size: ${pq.size()}`);
  assert(pq.peek() === 'task_a', 'Peek returns minimum priority element without removing');

  // Extract all in min order
  const extracted = [];
  while (!pq.isEmpty()) {
    extracted.push(pq.pop());
  }

  assert(
    extracted[0] === 'task_a' &&
    extracted[1] === 'task_b' &&
    extracted[2] === 'task_tie1' &&
    extracted[3] === 'task_c' &&
    extracted[4] === 'task_d',
    'MinPriorityQueue extracts elements in strict non-decreasing priority order',
    `Order: ${extracted.join(' -> ')}`
  );

  // Invalid priority validation
  let threwOnInvalid = false;
  try {
    pq.push('bad', NaN);
  } catch {
    threwOnInvalid = true;
  }
  assert(threwOnInvalid, 'MinPriorityQueue rejects NaN priority values');
} catch (err) {
  assert(false, 'Priority Queue execution error', err.message);
}

// ============================================================================
// TEST 2: ZERO-DISTANCE AND ZERO-COST EDGE HANDLING
// ============================================================================
console.log('\n--- 2. ZERO-DISTANCE AND ZERO-COST EDGE HANDLING ---');
try {
  const zeroGraph = new RoadGraph('Zero Cost Test Graph');
  zeroGraph.addNode({ id: 'N_A', coordinates: { latitude: 18.5, longitude: 73.8 } });
  zeroGraph.addNode({ id: 'N_B', coordinates: { latitude: 18.5, longitude: 73.8 } }); // Same physical point
  zeroGraph.addNode({ id: 'N_C', coordinates: { latitude: 18.55, longitude: 73.85 } });

  // Add zero-distance internal transfer edge
  zeroGraph.addEdge({
    id: 'E_ZERO',
    source: 'N_A',
    target: 'N_B',
    distanceKm: 0,
    baseSpeedKmH: 50,
    roadName: 'Internal Hospital Transfer Link',
  });

  zeroGraph.addEdge({
    id: 'E_LEG2',
    source: 'N_B',
    target: 'N_C',
    distanceKm: 4.5,
    baseSpeedKmH: 45,
    roadName: 'Arterial Leg',
  });

  const dijkstraZero = findShortestPathDijkstra(zeroGraph, 'N_A', 'N_C', { costMetric: 'distance' });
  const aStarZero = findShortestPathAStar(zeroGraph, 'N_A', 'N_C', { costMetric: 'distance' });

  assert(
    dijkstraZero.isValidRoute && dijkstraZero.totalCost === 4.5 && dijkstraZero.edgeSequence.length === 2,
    'Dijkstra traverses zero-cost edges correctly without infinite loop or failure',
    `Cost: ${dijkstraZero.totalCost}, Edges: ${dijkstraZero.edgeSequence.length}`
  );

  assert(
    aStarZero.isValidRoute && aStarZero.totalCost === 4.5,
    'A* traverses zero-cost edges with exact matching optimal cost',
    `Cost: ${aStarZero.totalCost}`
  );
} catch (err) {
  assert(false, 'Zero-cost edge test error', err.message);
}

// ============================================================================
// TEST 3: START EQUALS DESTINATION
// ============================================================================
console.log('\n--- 3. START EQUALS DESTINATION ---');
try {
  const testGraph = getPuneRoadGraph();
  const sameDijkstra = findShortestPathDijkstra(testGraph, 'NODE_PUNE_CENTRAL', 'NODE_PUNE_CENTRAL');
  const sameAStar = findShortestPathAStar(testGraph, 'NODE_PUNE_CENTRAL', 'NODE_PUNE_CENTRAL');

  assert(
    sameDijkstra.isValidRoute &&
    sameDijkstra.totalCost === 0 &&
    sameDijkstra.totalDistanceKm === 0 &&
    sameDijkstra.edgeSequence.length === 0 &&
    sameDijkstra.nodeSequence.length === 1,
    'Dijkstra handles start == destination with cost 0 and empty edge sequence'
  );

  assert(
    sameAStar.isValidRoute &&
    sameAStar.totalCost === 0 &&
    sameAStar.totalDistanceKm === 0 &&
    sameAStar.edgeSequence.length === 0 &&
    sameAStar.nodeSequence.length === 1,
    'A* handles start == destination with cost 0 and empty edge sequence'
  );
} catch (err) {
  assert(false, 'Start equals destination test error', err.message);
}

// ============================================================================
// TEST 4: DESTINATION UNREACHABLE / NO ROUTE EXISTS
// ============================================================================
console.log('\n--- 4. DESTINATION UNREACHABLE / NO ROUTE EXISTS ---');
try {
  const disconnectedGraph = new RoadGraph('Disconnected Graph');
  disconnectedGraph.addNode({ id: 'ISLAND_A', coordinates: { latitude: 18.5, longitude: 73.8 } });
  disconnectedGraph.addNode({ id: 'ISLAND_B', coordinates: { latitude: 18.6, longitude: 73.9 } });

  const dijkstraUnreachable = findShortestPathDijkstra(disconnectedGraph, 'ISLAND_A', 'ISLAND_B');
  const aStarUnreachable = findShortestPathAStar(disconnectedGraph, 'ISLAND_A', 'ISLAND_B');

  assert(
    !dijkstraUnreachable.isValidRoute &&
    dijkstraUnreachable.totalCost === Infinity &&
    dijkstraUnreachable.failureReason &&
    dijkstraUnreachable.nodeSequence.length === 0,
    'Dijkstra returns isValidRoute: false and Infinity cost when no path exists',
    `Reason: "${dijkstraUnreachable.failureReason}"`
  );

  assert(
    !aStarUnreachable.isValidRoute &&
    aStarUnreachable.totalCost === Infinity &&
    aStarUnreachable.failureReason &&
    aStarUnreachable.nodeSequence.length === 0,
    'A* returns isValidRoute: false and Infinity cost when no path exists',
    `Reason: "${aStarUnreachable.failureReason}"`
  );
} catch (err) {
  assert(false, 'Destination unreachable test error', err.message);
}

// ============================================================================
// TEST 5: INVALID COORDINATES AND INVALID GRAPH EDGES
// ============================================================================
console.log('\n--- 5. INVALID COORDINATES AND INVALID GRAPH EDGES ---');
try {
  let coordErrorCaught = false;
  try {
    haversineDistanceKm({ latitude: 'not-a-number', longitude: 73.8 }, { latitude: 18.5, longitude: 73.8 });
  } catch {
    coordErrorCaught = true;
  }
  assert(coordErrorCaught, 'haversineDistanceKm throws on invalid NaN coordinates');

  const invalidEdgeGraph = new RoadGraph('Invalid Edge Graph');
  invalidEdgeGraph.addNode({ id: 'V1', coordinates: { latitude: 18.1, longitude: 73.1 } });
  invalidEdgeGraph.addNode({ id: 'V2', coordinates: { latitude: 18.2, longitude: 73.2 } });

  let negativeDistCaught = false;
  try {
    invalidEdgeGraph.addEdge({ source: 'V1', target: 'V2', distanceKm: -10 });
  } catch {
    negativeDistCaught = true;
  }
  assert(negativeDistCaught, 'RoadGraph rejects negative edge distances');

  let missingTargetCaught = false;
  try {
    invalidEdgeGraph.addEdge({ source: 'V1', target: 'NON_EXISTENT_V3', distanceKm: 5 });
  } catch {
    missingTargetCaught = true;
  }
  assert(missingTargetCaught, 'RoadGraph rejects edges connecting to non-existent target nodes');
} catch (err) {
  assert(false, 'Invalid coordinates and edges test error', err.message);
}

// ============================================================================
// TEST 6: A* AND DIJKSTRA EQUAL OPTIMAL COSTS ACROSS DIVERSE CORRIDORS
// ============================================================================
console.log('\n--- 6. A* AND DIJKSTRA EQUAL OPTIMAL COSTS ACROSS CORRIDORS ---');
try {
  const puneGraph = getPuneRoadGraph();

  const corridors = [
    { from: 'NODE_HINJAWADI', to: 'NODE_PUNE_CENTRAL', metric: 'time' },
    { from: 'NODE_KOTHRUD', to: 'NODE_PIMPRI', metric: 'time' },
    { from: 'NODE_SAHYADRI', to: 'NODE_HADAPSAR', metric: 'time' },
    { from: 'NODE_WAKAD', to: 'NODE_SWARGATE', metric: 'distance' },
  ];

  for (const c of corridors) {
    const dRes = findShortestPathDijkstra(puneGraph, c.from, c.to, { costMetric: c.metric });
    const aRes = findShortestPathAStar(puneGraph, c.from, c.to, { costMetric: c.metric });

    const costDiff = Math.abs(dRes.totalCost - aRes.totalCost);
    const costsMatch = costDiff < 0.001;
    const aStarEfficient = aRes.expandedNodeCount <= dRes.expandedNodeCount;

    assert(
      costsMatch && dRes.isValidRoute && aRes.isValidRoute,
      `Equal optimal cost for ${c.from} -> ${c.to} [${c.metric}]`,
      `Dijkstra: ${dRes.totalCost}, A*: ${aRes.totalCost}, Diff: ${costDiff.toFixed(6)}`
    );

    assert(
      aStarEfficient,
      `A* explores <= nodes than Dijkstra for ${c.from} -> ${c.to}`,
      `A* expanded: ${aRes.expandedNodeCount}, Dijkstra expanded: ${dRes.expandedNodeCount}`
    );
  }
} catch (err) {
  assert(false, 'A* vs Dijkstra optimal cost test error', err.message);
}

// ============================================================================
// TEST 7: CLOSED ROAD AVOIDANCE
// ============================================================================
console.log('\n--- 7. CLOSED ROAD AVOIDANCE ---');
try {
  const graph = getPuneRoadGraph().clone();

  // Route from Baner to University Circle normally goes via Baner Road direct
  const initialRoute = findShortestPathAStar(graph, 'NODE_BANER', 'NODE_UNIVERSITY_CIRCLE');
  const usedInitialDirect = initialRoute.edgeSequence.some((e) => e.roadName.includes('Baner Road Direct'));

  // Now simulate an emergency road closure on Baner Road Direct
  graph.setRoadClosureByName('Baner Road Direct', true);

  const detourRoute = findShortestPathAStar(graph, 'NODE_BANER', 'NODE_UNIVERSITY_CIRCLE');
  const usedClosedRoad = detourRoute.edgeSequence.some((e) => e.roadName.includes('Baner Road Direct'));
  const foundDetour = detourRoute.isValidRoute && detourRoute.edgeSequence.some((e) => e.roadName.includes('Aundh'));

  assert(
    usedInitialDirect,
    'Baseline route uses direct road corridor when open'
  );

  assert(
    !usedClosedRoad && foundDetour,
    'Pathfinder strictly avoids closed roads and pivots to active detour corridor (via Aundh)',
    `Closed road in route: ${usedClosedRoad}, Detour via Aundh: ${foundDetour}`
  );

  // If ALL outgoing routes are closed
  graph.setEdgeClosure('ROAD_AUNDH_BANER_rev', true);
  graph.setEdgeClosure('ROAD_BANER_WAKAD_HWY_fwd', true);
  const trappedRoute = findShortestPathAStar(graph, 'NODE_BANER', 'NODE_UNIVERSITY_CIRCLE');
  assert(
    !trappedRoute.isValidRoute && trappedRoute.totalCost === Infinity,
    'Pathfinder reports isValidRoute: false when all paths to destination are closed'
  );
} catch (err) {
  assert(false, 'Closed road avoidance test error', err.message);
}

// ============================================================================
// TEST 8: CONGESTION CHANGES ROUTE SELECTION
// ============================================================================
console.log('\n--- 8. CONGESTION CHANGES ROUTE SELECTION ---');
try {
  const graph = getPuneRoadGraph().clone();

  // From Hinjawadi to University Circle:
  // Route 1: via Wakad -> Baner -> University (Highway / Expressway link)
  // Route 2: via Wakad -> Aundh -> University
  const clearRoute = findShortestPathAStar(graph, 'NODE_HINJAWADI', 'NODE_UNIVERSITY_CIRCLE', { costMetric: 'time' });
  const initialEdges = clearRoute.edgeSequence.map((e) => e.id);

  // Apply heavy congestion (3.5x penalty) to Baner Road
  for (const edge of graph.getAllEdges()) {
    if (edge.roadName.includes('Baner')) {
      graph.setEdgeCongestion(edge.id, 3.5);
    }
  }

  const congestedRoute = findShortestPathAStar(graph, 'NODE_HINJAWADI', 'NODE_UNIVERSITY_CIRCLE', { costMetric: 'time' });
  const newEdges = congestedRoute.edgeSequence.map((e) => e.id);

  assert(
    congestedRoute.isValidRoute,
    'Routing succeeds with congestion penalties applied'
  );

  assert(
    congestedRoute.totalCost > clearRoute.totalCost,
    'Congestion increases total travel time cost as expected',
    `Clear: ${clearRoute.totalCost}m, Congested: ${congestedRoute.totalCost}m`
  );

  const shiftedRoute = !newEdges.includes('ROAD_UNI_BANER_rev');
  assert(
    shiftedRoute,
    'Congestion causes route selection to actively shift to less congested alternative corridor'
  );
} catch (err) {
  assert(false, 'Congestion route shift test error', err.message);
}

// ============================================================================
// TEST 9: GRAPH ADAPTER & END-TO-END EXPRESS ROUTING REGRESSION
// ============================================================================
console.log('\n--- 9. GRAPH ADAPTER & EXPRESS REGRESSION TESTS ---');
try {
  // Test 9.1: Valid Pune coordinates snap to demo graph
  const puneOrigin = { latitude: 18.5913, longitude: 73.7380, address: 'Hinjawadi IT Park' };
  const puneDest = { latitude: 18.5314, longitude: 73.8478, address: 'Pune Central Hospital' };

  const graphRoute = calculateDeterministicRoute({
    origin: puneOrigin,
    destination: puneDest,
    algorithm: 'a_star',
    triageLevel: 'critical',
  });

  assert(
    graphRoute.success === true &&
    graphRoute.isGraphRouted === true &&
    graphRoute.algorithm === 'a_star' &&
    graphRoute.nodeSequence.length >= 3 &&
    graphRoute.totalDistanceKm > 0 &&
    graphRoute.priorityLaneEligible === true,
    'calculateDeterministicRoute correctly snaps Pune coordinates and solves on graph',
    `Corridor: "${graphRoute.corridorName}", Distance: ${graphRoute.totalDistanceKm}km, Time: ${graphRoute.estimatedDurationMinutes}m`
  );

  // Test 9.2: Out-of-bounds coordinates (NYC from older tests) trigger standard fallback gracefully
  const nycOrigin = { latitude: 40.7527, longitude: -73.9996, address: 'New York, NY' };
  const nycDest = { latitude: 40.7484, longitude: -73.9851, address: 'Metro City, NY' };

  const fallbackRoute = calculateDeterministicRoute({
    origin: nycOrigin,
    destination: nycDest,
    triageLevel: 'urgent',
  });

  assert(
    fallbackRoute.success === true &&
    fallbackRoute.isGraphRouted === false &&
    fallbackRoute.source === 'standard_route_fallback' &&
    fallbackRoute.totalDistanceKm > 0 &&
    Boolean(fallbackRoute.fallbackReason),
    'calculateDeterministicRoute safely triggers standard fallback without fabricating fake graph route',
    `Source: ${fallbackRoute.source}, Fallback reason: "${fallbackRoute.fallbackReason}"`
  );

  // Test 9.3: optimizeRoute integration maintains API signature contract
  const optResult = await optimizeRoute({
    origin: puneOrigin,
    destination: puneDest,
    trafficCondition: 'moderate',
    triageLevel: 'critical',
  });

  assert(
    Boolean(optResult.recommendedRouteName) &&
    Boolean(optResult.reasoning) &&
    Array.isArray(optResult.avoidedHazards) &&
    typeof optResult.estimatedTimeSavedMinutes === 'number' &&
    optResult.priorityLaneEligible === true &&
    optResult.totalDistanceKm > 0 &&
    Boolean(optResult.disclaimer),
    'geminiService.optimizeRoute returns all contract fields while using deterministic engine under the hood',
    `Route: "${optResult.recommendedRouteName}", Distance: ${optResult.totalDistanceKm}km, Source: ${optResult.source}`
  );
} catch (err) {
  assert(false, 'Graph adapter regression test error', err.message);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n======================================================================');
console.log(`TEST SUITE RESULTS: ${passCount} Passed, ${failCount} Failed.`);
console.log('======================================================================');

if (failCount > 0) {
  process.exit(1);
}
