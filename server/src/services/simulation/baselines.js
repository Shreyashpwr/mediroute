/**
 * MediRoute Baseline & Proposed Dispatch/Routing Decision Policies.
 *
 * Implements three dispatch & routing strategies:
 * 1. PROPOSED: MediRoute Multi-Criteria Allocation Engine with Deterministic A* Routing
 *    - Hard constraint filtering (status, vehicle capabilities, hospital department, ICU capacity, non-divert).
 *    - Normalized multi-criteria scoring balancing travel time, fuel readiness, clinical capability, bed reserve, and route reliability.
 *    - Deterministic A* routing avoiding active road closures and heavy congestion.
 *
 * 2. NEAREST_AVAILABLE (Baseline): Greedy Proximity Dispatch
 *    - Traditional CAD approach: selects the available ambulance closest to the scene by direct Haversine distance.
 *    - Selects the closest receiving hospital with at least one available emergency bed.
 *    - Does not balance vehicle readiness, capability hierarchy, or facility status.
 *
 * 3. SHORTEST_PATH_DIJKSTRA (Baseline): Topological Distance-Shortest Dispatch
 *    - Evaluates path distance on the road network using standard Dijkstra shortest-path algorithm.
 *    - Selects the available ambulance with the shortest road network distance to the incident.
 *    - Dispatches to the hospital with the shortest Dijkstra road distance having at least one bed.
 *    - Ignores clinical department specialties, ICU buffers, and fuel reserves.
 *
 * All policies execute against identical candidate states, coordinates, and road graphs.
 */

import { evaluateAllocation } from '../allocationService.js';
import { calculateDeterministicRoute } from '../routing/graphAdapter.js';
import { haversineDistanceKm } from '../routing/routeCost.js';

export const ALGORITHM_POLICIES = {
  PROPOSED: 'proposed',
  NEAREST_AVAILABLE: 'nearest_available',
  SHORTEST_PATH_DIJKSTRA: 'shortest_path_dijkstra',
};

/**
 * 1. PROPOSED DISPATCH POLICY: Multi-Criteria Allocation + Deterministic A*
 */
export const dispatchProposed = async ({
  incident,
  ambulances,
  facilities,
  trafficCondition = 'moderate',
  roadClosures = [],
}) => {
  const startCpu = performance.now();

  // Evaluate candidate resources using deterministic multi-criteria engine
  const allocation = await evaluateAllocation({
    incidentLocation: incident.location,
    triageLevel: incident.triageLevel,
    symptoms: incident.symptoms,
    trafficCondition,
    roadClosures,
    ambulances,
    facilities,
  });

  const computeTimeMs = Number((performance.now() - startCpu).toFixed(3));

  if (!allocation.isFeasible || !allocation.selectedAmbulance || !allocation.selectedFacility) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.PROPOSED,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: allocation.failureReason || 'No feasible resource pairing satisfies constraints',
      computeTimeMs,
    };
  }

  const amb = allocation.selectedAmbulance;
  const fac = allocation.selectedFacility;

  const ambRecord = ambulances.find((a) => String(a.id || a._id) === String(amb.id)) || amb;
  const facRecord = facilities.find((f) => String(f.id || f._id) === String(fac.id)) || fac;

  const ambCoords = ambRecord.location?.coordinates || [73.8478, 18.5314];
  const facCoords = facRecord.location?.coordinates || [73.8478, 18.5314];

  // Calculate deterministic A* route from ambulance to incident scene
  const routeToScene = calculateDeterministicRoute({
    origin: { latitude: ambCoords[1], longitude: ambCoords[0] },
    destination: { latitude: incident.location.coordinates[1], longitude: incident.location.coordinates[0] },
    algorithm: 'a_star',
    costMetric: 'time',
    trafficCondition,
    roadClosures,
  });

  // Calculate deterministic A* route from scene to receiving facility
  const routeToFacility = calculateDeterministicRoute({
    origin: { latitude: incident.location.coordinates[1], longitude: incident.location.coordinates[0] },
    destination: { latitude: facCoords[1], longitude: facCoords[0] },
    algorithm: 'a_star',
    costMetric: 'time',
    trafficCondition,
    roadClosures,
  });

  return {
    success: true,
    algorithm: ALGORITHM_POLICIES.PROPOSED,
    selectedAmbulance: amb,
    selectedFacility: fac,
    routeToScene,
    routeToFacility,
    estimatedResponseTimeMinutes: routeToScene.estimatedDurationMinutes || amb.estimatedEtaMinutes || 15,
    estimatedTransitTimeMinutes: routeToFacility.estimatedDurationMinutes || fac.estimatedTransitMinutes || 15,
    allocationDetails: {
      ambulanceScore: amb.score,
      facilityScore: fac.score,
      weights: allocation.weights,
      scoringEquation: allocation.scoringEquation,
    },
    computeTimeMs,
  };
};

/**
 * 2. NEAREST AVAILABLE BASELINE: Greedy Proximity
 */
export const dispatchNearestAvailable = async ({
  incident,
  ambulances,
  facilities,
  trafficCondition = 'moderate',
  roadClosures = [],
}) => {
  const startCpu = performance.now();

  const incidentLat = incident.location.coordinates[1];
  const incidentLon = incident.location.coordinates[0];

  // 1. Filter available ambulances (greedy only checks status)
  const availableAmbs = ambulances.filter((a) => a.status === 'available' && a.isActive !== false);

  if (availableAmbs.length === 0) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.NEAREST_AVAILABLE,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: 'No ambulances in available status',
      computeTimeMs: Number((performance.now() - startCpu).toFixed(3)),
    };
  }

  // Find nearest ambulance by direct Haversine distance
  let nearestAmb = null;
  let minAmbDist = Infinity;

  for (const amb of availableAmbs) {
    const coords = amb.location?.coordinates;
    if (!coords) continue;
    const dist = haversineDistanceKm(
      { latitude: coords[1], longitude: coords[0] },
      { latitude: incidentLat, longitude: incidentLon }
    );
    if (dist < minAmbDist) {
      minAmbDist = dist;
      nearestAmb = amb;
    }
  }

  // 2. Filter facilities with at least 1 emergency bed (no ICU or department check)
  const candidateFacs = facilities.filter(
    (f) => f.isActive !== false && (f.emergencyCapacity?.availableBeds ?? 0) >= 1
  );

  if (candidateFacs.length === 0) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.NEAREST_AVAILABLE,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: 'No receiving facilities with available beds',
      computeTimeMs: Number((performance.now() - startCpu).toFixed(3)),
    };
  }

  // Find nearest facility by direct Haversine distance
  let nearestFac = null;
  let minFacDist = Infinity;

  for (const fac of candidateFacs) {
    const coords = fac.location?.coordinates;
    if (!coords) continue;
    const dist = haversineDistanceKm(
      { latitude: incidentLat, longitude: incidentLon },
      { latitude: coords[1], longitude: coords[0] }
    );
    if (dist < minFacDist) {
      minFacDist = dist;
      nearestFac = fac;
    }
  }

  const computeTimeMs = Number((performance.now() - startCpu).toFixed(3));

  if (!nearestAmb || !nearestFac) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.NEAREST_AVAILABLE,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: 'Could not pair nearest ambulance and facility',
      computeTimeMs,
    };
  }

  // Standard route calculation for nearest baseline (without A* intelligent detour)
  const routeToScene = calculateDeterministicRoute({
    origin: { latitude: nearestAmb.location.coordinates[1], longitude: nearestAmb.location.coordinates[0] },
    destination: { latitude: incidentLat, longitude: incidentLon },
    algorithm: 'dijkstra',
    costMetric: 'distance',
    trafficCondition,
    roadClosures,
  });

  const routeToFacility = calculateDeterministicRoute({
    origin: { latitude: incidentLat, longitude: incidentLon },
    destination: { latitude: nearestFac.location.coordinates[1], longitude: nearestFac.location.coordinates[0] },
    algorithm: 'dijkstra',
    costMetric: 'distance',
    trafficCondition,
    roadClosures,
  });

  return {
    success: true,
    algorithm: ALGORITHM_POLICIES.NEAREST_AVAILABLE,
    selectedAmbulance: nearestAmb,
    selectedFacility: nearestFac,
    routeToScene,
    routeToFacility,
    estimatedResponseTimeMinutes: routeToScene.estimatedDurationMinutes || (minAmbDist * 1.3 / 35) * 60,
    estimatedTransitTimeMinutes: routeToFacility.estimatedDurationMinutes || (minFacDist * 1.3 / 35) * 60,
    computeTimeMs,
  };
};

/**
 * 3. SHORTEST-PATH DIJKSTRA BASELINE: Road Network Distance
 */
export const dispatchShortestPathDijkstra = async ({
  incident,
  ambulances,
  facilities,
  trafficCondition = 'moderate',
  roadClosures = [],
}) => {
  const startCpu = performance.now();

  const incidentLat = incident.location.coordinates[1];
  const incidentLon = incident.location.coordinates[0];

  const availableAmbs = ambulances.filter((a) => a.status === 'available' && a.isActive !== false);

  if (availableAmbs.length === 0) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: 'No ambulances available for Dijkstra evaluation',
      computeTimeMs: Number((performance.now() - startCpu).toFixed(3)),
    };
  }

  // Evaluate shortest Dijkstra distance path for all available ambulances
  let bestAmb = null;
  let bestAmbRoute = null;
  let minDistanceKm = Infinity;

  for (const amb of availableAmbs) {
    const coords = amb.location?.coordinates;
    if (!coords) continue;

    const route = calculateDeterministicRoute({
      origin: { latitude: coords[1], longitude: coords[0] },
      destination: { latitude: incidentLat, longitude: incidentLon },
      algorithm: 'dijkstra',
      costMetric: 'distance',
      trafficCondition,
      roadClosures,
    });

    if (route.isValidRoute && route.totalDistanceKm < minDistanceKm) {
      minDistanceKm = route.totalDistanceKm;
      bestAmb = amb;
      bestAmbRoute = route;
    }
  }

  // Filter facilities with available beds
  const candidateFacs = facilities.filter(
    (f) => f.isActive !== false && (f.emergencyCapacity?.availableBeds ?? 0) >= 1
  );

  if (candidateFacs.length === 0 || !bestAmb) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA,
      selectedAmbulance: null,
      selectedFacility: null,
      routeToScene: null,
      routeToFacility: null,
      failureReason: !bestAmb ? 'No valid Dijkstra path to scene' : 'No facilities with available beds',
      computeTimeMs: Number((performance.now() - startCpu).toFixed(3)),
    };
  }

  // Evaluate shortest Dijkstra distance to facility
  let bestFac = null;
  let bestFacRoute = null;
  let minFacDistanceKm = Infinity;

  for (const fac of candidateFacs) {
    const coords = fac.location?.coordinates;
    if (!coords) continue;

    const route = calculateDeterministicRoute({
      origin: { latitude: incidentLat, longitude: incidentLon },
      destination: { latitude: coords[1], longitude: coords[0] },
      algorithm: 'dijkstra',
      costMetric: 'distance',
      trafficCondition,
      roadClosures,
    });

    if (route.isValidRoute && route.totalDistanceKm < minFacDistanceKm) {
      minFacDistanceKm = route.totalDistanceKm;
      bestFac = fac;
      bestFacRoute = route;
    }
  }

  const computeTimeMs = Number((performance.now() - startCpu).toFixed(3));

  if (!bestFac || !bestFacRoute) {
    return {
      success: false,
      algorithm: ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA,
      selectedAmbulance: bestAmb,
      selectedFacility: null,
      routeToScene: bestAmbRoute,
      routeToFacility: null,
      failureReason: 'No traversable Dijkstra route to any facility with beds',
      computeTimeMs,
    };
  }

  return {
    success: true,
    algorithm: ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA,
    selectedAmbulance: bestAmb,
    selectedFacility: bestFac,
    routeToScene: bestAmbRoute,
    routeToFacility: bestFacRoute,
    estimatedResponseTimeMinutes: bestAmbRoute.estimatedDurationMinutes,
    estimatedTransitTimeMinutes: bestFacRoute.estimatedDurationMinutes,
    computeTimeMs,
  };
};

/**
 * Dispatcher router to execute the selected policy.
 */
export const executeDispatchPolicy = async (algorithm, params) => {
  switch (algorithm) {
    case ALGORITHM_POLICIES.PROPOSED:
      return await dispatchProposed(params);
    case ALGORITHM_POLICIES.NEAREST_AVAILABLE:
      return await dispatchNearestAvailable(params);
    case ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA:
      return await dispatchShortestPathDijkstra(params);
    default:
      throw new Error(`Unknown simulation algorithm policy: '${algorithm}'`);
  }
};

export default {
  ALGORITHM_POLICIES,
  dispatchProposed,
  dispatchNearestAvailable,
  dispatchShortestPathDijkstra,
  executeDispatchPolicy,
};
