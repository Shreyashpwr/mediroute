/**
 * routeCost.js: Cost and distance metric calculations for deterministic routing.
 * Ensures consistent, admissible, and monotonic cost evaluation for Dijkstra and A*.
 */

export const EARTH_RADIUS_KM = 6371.0088; // WGS-84 mean radius
export const DEFAULT_MAX_NETWORK_SPEED_KMH = 120; // Defensible emergency vehicle speed ceiling

/**
 * Calculates straight-line great-circle distance between two geographic coordinates using the Haversine formula.
 * @param {object} coord1 - { latitude, longitude }
 * @param {object} coord2 - { latitude, longitude }
 * @returns {number} Distance in kilometers
 */
export const haversineDistanceKm = (coord1, coord2) => {
  if (!coord1 || !coord2) return 0;
  const lat1 = Number(coord1.latitude ?? coord1.lat);
  const lon1 = Number(coord1.longitude ?? coord1.lng ?? coord1.lon);
  const lat2 = Number(coord2.latitude ?? coord2.lat);
  const lon2 = Number(coord2.longitude ?? coord2.lng ?? coord2.lon);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    throw new Error(`Invalid coordinates supplied to haversineDistanceKm: [${lat1}, ${lon1}] -> [${lat2}, ${lon2}]`);
  }

  // Same point
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, a))), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
};

/**
 * Computes effective speed accounting for base speed and congestion factor.
 * @param {number} baseSpeedKmH - Free-flow speed in km/h
 * @param {number} congestionMultiplier - Congestion penalty factor >= 1.0 (1.0 = normal, 2.0 = heavy)
 * @returns {number} Effective transit speed in km/h
 */
export const computeEffectiveSpeedKmH = (baseSpeedKmH, congestionMultiplier = 1.0) => {
  const speed = Number(baseSpeedKmH) || 40;
  const multiplier = Math.max(1.0, Number(congestionMultiplier) || 1.0);
  return Math.max(5.0, speed / multiplier); // Minimum speed floor of 5 km/h to prevent divide-by-zero
};

/**
 * Computes travel time in minutes for a given distance and effective speed.
 * @param {number} distanceKm - Distance in km
 * @param {number} effectiveSpeedKmH - Effective speed in km/h
 * @returns {number} Travel time in minutes
 */
export const computeTravelTimeMinutes = (distanceKm, effectiveSpeedKmH) => {
  if (distanceKm <= 0) return 0;
  const speed = Math.max(1.0, effectiveSpeedKmH || 40);
  return (distanceKm / speed) * 60;
};

/**
 * Computes the traversal cost of a directed road edge.
 * Closed edges return Infinity so they are never traversed by pathfinders.
 * Zero-distance or zero-cost edges return 0.
 *
 * @param {object} edge - Directed edge object
 * @param {string} costMetric - 'time' (default) or 'distance'
 * @returns {number} Traversal cost
 */
export const computeEdgeCost = (edge, costMetric = 'time') => {
  if (!edge) return Infinity;

  // Closed road: impassable
  if (edge.isClosed) {
    return Infinity;
  }

  const distance = Number(edge.distanceKm);
  if (isNaN(distance) || distance < 0) {
    throw new Error(`Edge ${edge.id} has invalid distance: ${distance}`);
  }

  // Zero-distance edge
  if (distance === 0) {
    return 0;
  }

  if (costMetric === 'distance') {
    return distance;
  }

  // Cost metric 'time' (in minutes)
  const effectiveSpeed = computeEffectiveSpeedKmH(
    edge.baseSpeedKmH || 45,
    edge.congestionMultiplier || 1.0
  );

  const timeMinutes = computeTravelTimeMinutes(distance, effectiveSpeed);
  return timeMinutes;
};

/**
 * Creates an admissible, consistent heuristic function h(n) for A* search.
 * - Distance metric: Straight-line Haversine distance (never overestimates road distance).
 * - Time metric: Haversine distance divided by max network speed (never overestimates actual travel time).
 *
 * @param {object} targetNode - Destination node with coordinates { latitude, longitude }
 * @param {string} costMetric - 'time' or 'distance'
 * @param {number} maxNetworkSpeedKmH - Maximum possible speed in the network
 * @returns {Function} (node) => heuristic estimate to targetNode
 */
export const createAdmissibleHeuristic = (
  targetNode,
  costMetric = 'time',
  maxNetworkSpeedKmH = DEFAULT_MAX_NETWORK_SPEED_KMH
) => {
  if (!targetNode || !targetNode.coordinates) {
    // If target has no coordinates, return admissible 0 (equivalent to Dijkstra)
    return () => 0;
  }

  const targetCoords = targetNode.coordinates;
  const maxSpeed = Math.max(10, Number(maxNetworkSpeedKmH) || DEFAULT_MAX_NETWORK_SPEED_KMH);

  return (node) => {
    if (!node || !node.coordinates) return 0;
    const straightLineKm = haversineDistanceKm(node.coordinates, targetCoords);

    if (costMetric === 'distance') {
      return straightLineKm;
    }

    // Time metric: straight-line distance at max possible network speed
    // (straightLineKm / maxSpeed) * 60 minutes
    // Since straightLineKm <= roadDistance and maxSpeed >= actualSpeed,
    // (straightLineKm / maxSpeed) <= (roadDistance / actualSpeed) = true travel time.
    return (straightLineKm / maxSpeed) * 60;
  };
};

export default {
  EARTH_RADIUS_KM,
  DEFAULT_MAX_NETWORK_SPEED_KMH,
  haversineDistanceKm,
  computeEffectiveSpeedKmH,
  computeTravelTimeMinutes,
  computeEdgeCost,
  createAdmissibleHeuristic,
};
