/**
 * MediRoute Simulation Metrics & Statistical Analysis Engine.
 *
 * Computes deterministic operational metrics from simulation event logs:
 * - Response times (mean, median, p95) in minutes
 * - Incident service rates & completion counts
 * - Algorithm computation times in milliseconds
 * - Route correctness and road closure detour success
 * - Ambulance fleet and facility bed utilization rates
 *
 * All definitions, units, and empty-sample guardrails are strictly standardized.
 */

/**
 * Metric Definitions and Metadata Dictionary
 */
export const METRIC_DEFINITIONS = {
  totalIncidents: {
    name: 'Total Incidents',
    unit: 'count',
    description: 'Total number of synthetic emergency incidents generated in the scenario.',
  },
  completedIncidentCount: {
    name: 'Completed Incidents',
    unit: 'count',
    description: 'Number of emergency incidents where an ambulance reached the scene and transported the patient to a hospital.',
  },
  unservedIncidentCount: {
    name: 'Unserved Incidents',
    unit: 'count',
    description: 'Number of incidents that could not be served due to resource exhaustion, hospital capacity deficit, or timeout.',
  },
  unservedIncidentRate: {
    name: 'Unserved Incident Rate',
    unit: 'fraction (0-1)',
    description: 'Ratio of unserved incidents to total generated incidents (unserved / total). Lower is better.',
  },
  meanResponseTimeMinutes: {
    name: 'Mean Response Time',
    unit: 'minutes',
    description: 'Arithmetic mean duration elapsed between incident generation and ambulance arrival at the scene. Lower is better.',
  },
  medianResponseTimeMinutes: {
    name: 'Median Response Time',
    unit: 'minutes',
    description: '50th percentile (P50) duration from incident generation to ambulance arrival at the scene. Lower is better.',
  },
  p95ResponseTimeMinutes: {
    name: 'P95 Response Time',
    unit: 'minutes',
    description: '95th percentile duration from incident generation to ambulance arrival at the scene. Lower is better.',
  },
  minResponseTimeMinutes: {
    name: 'Minimum Response Time',
    unit: 'minutes',
    description: 'Fastest recorded response time in the scenario.',
  },
  maxResponseTimeMinutes: {
    name: 'Maximum Response Time',
    unit: 'minutes',
    description: 'Slowest recorded response time among completed incidents.',
  },
  meanTransitTimeMinutes: {
    name: 'Mean Hospital Transit Time',
    unit: 'minutes',
    description: 'Mean transit time from incident pickup scene to hospital emergency department admission.',
  },
  averageAlgorithmComputeTimeMs: {
    name: 'Algorithm Compute Latency',
    unit: 'milliseconds',
    description: 'Average wall-clock computation time per dispatch decision calculation.',
  },
  routeCorrectness: {
    name: 'Route Correctness',
    unit: 'fraction (0-1)',
    description: 'Fraction of planned corridors that traversed non-closed roads and successfully connected origin to destination.',
  },
  ambulanceUtilization: {
    name: 'Ambulance Fleet Utilization',
    unit: 'fraction (0-1)',
    description: 'Average fraction of total simulation time that ambulances spent active on dispatch missions.',
  },
  facilityBedUtilization: {
    name: 'Hospital Bed Utilization',
    unit: 'fraction (0-1)',
    description: 'Average occupancy fraction of receiving hospital emergency bed capacity over the simulation timeline.',
  },
};

/**
 * Calculates arithmetic mean of a numeric array.
 * @param {number[]} values
 * @returns {number} Mean value, or 0 if empty
 */
export const calculateMean = (values) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const valid = values.filter((v) => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return Number((sum / valid.length).toFixed(3));
};

/**
 * Calculates percentile of a sorted or unsorted numeric array using nearest rank or linear interpolation.
 * @param {number[]} values
 * @param {number} p - Percentile in [0, 100]
 * @returns {number} Calculated percentile, or 0 if empty
 */
export const calculatePercentile = (values, p = 50) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const valid = values.filter((v) => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  if (valid.length === 1) return valid[0];

  const index = (p / 100) * (valid.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return Number(valid[lower].toFixed(3));
  const interpolated = valid[lower] * (1 - weight) + valid[upper] * weight;
  return Number(interpolated.toFixed(3));
};

/**
 * Computes standard deviation.
 * @param {number[]} values
 * @returns {number}
 */
export const calculateStdDev = (values) => {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = calculateMean(values);
  const sumSquares = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  return Number(Math.sqrt(sumSquares / (values.length - 1)).toFixed(3));
};

/**
 * Aggregates raw simulation event logs into standardized metrics report.
 *
 * @param {Object} params
 * @param {Array} params.eventLog - Chronological simulation events
 * @param {Array} params.incidents - List of generated incidents with final state
 * @param {Array} params.ambulances - Final state of ambulances with busy times
 * @param {Array} params.facilities - Final state of facilities with admission records
 * @param {number} params.durationMinutes - Total simulated time duration
 * @param {Array} params.computationTimesMs - Array of decision compute latencies
 * @returns {Object} Comprehensive metrics dictionary
 */
export const computeSimulationMetrics = ({
  eventLog = [],
  incidents = [],
  ambulances = [],
  facilities = [],
  durationMinutes = 120,
  computationTimesMs = [],
}) => {
  const totalIncidents = incidents.length;

  // Extract completed incidents (both scene arrival and hospital arrival achieved)
  const completedIncidents = incidents.filter(
    (inc) => inc.status === 'completed' || inc.status === 'admitted'
  );
  const completedIncidentCount = completedIncidents.length;

  // Extract unserved incidents
  const unservedIncidents = incidents.filter(
    (inc) => inc.status === 'unserved' || inc.status === 'cancelled' || inc.status === 'timed_out'
  );
  const unservedIncidentCount = unservedIncidents.length;
  const unservedIncidentRate =
    totalIncidents > 0 ? Number((unservedIncidentCount / totalIncidents).toFixed(4)) : 0;

  // Response times (minutes from incident report to ambulance arrival at scene)
  const responseTimes = completedIncidents
    .map((inc) => inc.responseTimeMinutes)
    .filter((t) => typeof t === 'number' && !isNaN(t) && t >= 0);

  // Transit times (minutes from scene departure to hospital admission)
  const transitTimes = completedIncidents
    .map((inc) => inc.transitTimeMinutes)
    .filter((t) => typeof t === 'number' && !isNaN(t) && t >= 0);

  // Total mission times (response + scene + transit)
  const totalMissionTimes = completedIncidents
    .map((inc) => inc.totalMissionDurationMinutes)
    .filter((t) => typeof t === 'number' && !isNaN(t) && t >= 0);

  // Route correctness: events checking road closed violations
  const routeEvents = eventLog.filter((e) => e.eventType === 'DISPATCH_DECISION' || e.eventType === 'ROUTE_PLANNED');
  const validRouteEvents = routeEvents.filter((e) => e.data?.isValidRoute !== false && !e.data?.encounteredClosure);
  const routeCorrectness =
    routeEvents.length > 0
      ? Number((validRouteEvents.length / routeEvents.length).toFixed(4))
      : 1.0; // 100% correct if no route events

  // Ambulance fleet utilization
  // Utilization = total fleet busy time / (fleet size * durationMinutes)
  let ambulanceUtilization = 0;
  if (ambulances.length > 0 && durationMinutes > 0) {
    const totalFleetBusyMinutes = ambulances.reduce((acc, a) => acc + (a.totalBusyTimeMinutes || 0), 0);
    const maxPossibleMinutes = ambulances.length * durationMinutes;
    ambulanceUtilization = Number(
      Math.min(1.0, Math.max(0, totalFleetBusyMinutes / maxPossibleMinutes)).toFixed(4)
    );
  }

  // Facility bed occupancy rate
  // Average across hospitals of (peakOccupiedBeds / totalBeds)
  let facilityBedUtilization = 0;
  if (facilities.length > 0) {
    const ratios = facilities.map((f) => {
      const cap = f.emergencyCapacity || {};
      const total = Number(cap.totalBeds || 50);
      const peakOccupied = Number(f.peakOccupiedBeds || (total - (cap.availableBeds ?? total)));
      return total > 0 ? Math.min(1.0, Math.max(0, peakOccupied / total)) : 0;
    });
    facilityBedUtilization = calculateMean(ratios);
  }

  // Algorithm computation times
  const computeTimes = Array.isArray(computationTimesMs) ? computationTimesMs : [];
  const averageAlgorithmComputeTimeMs = calculateMean(computeTimes);
  const medianAlgorithmComputeTimeMs = calculatePercentile(computeTimes, 50);
  const p95AlgorithmComputeTimeMs = calculatePercentile(computeTimes, 95);

  return {
    sampleSize: {
      totalIncidents,
      completedIncidentCount,
      unservedIncidentCount,
      responseTimesSampleCount: responseTimes.length,
    },
    performanceMetrics: {
      meanResponseTimeMinutes: calculateMean(responseTimes),
      medianResponseTimeMinutes: calculatePercentile(responseTimes, 50),
      p95ResponseTimeMinutes: calculatePercentile(responseTimes, 95),
      minResponseTimeMinutes: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTimeMinutes: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      stdDevResponseTimeMinutes: calculateStdDev(responseTimes),
      meanTransitTimeMinutes: calculateMean(transitTimes),
      meanTotalMissionTimeMinutes: calculateMean(totalMissionTimes),
    },
    serviceLevelMetrics: {
      unservedIncidentRate,
      completedIncidentRate: totalIncidents > 0 ? Number((completedIncidentCount / totalIncidents).toFixed(4)) : 0,
      routeCorrectness,
    },
    utilizationMetrics: {
      ambulanceUtilization,
      facilityBedUtilization,
    },
    computationalMetrics: {
      decisionCount: computeTimes.length,
      averageAlgorithmComputeTimeMs,
      medianAlgorithmComputeTimeMs,
      p95AlgorithmComputeTimeMs,
      totalComputationTimeMs: Number(computeTimes.reduce((acc, t) => acc + t, 0).toFixed(2)),
    },
    meta: {
      definitions: METRIC_DEFINITIONS,
      computedAt: new Date().toISOString(),
      isSimulatedData: true,
      dataNotice: 'ALL SIMULATION METRICS DERIVED STRICTLY FROM DETERMINISTIC DISCRETE-EVENT TRACES',
    },
  };
};

export default {
  METRIC_DEFINITIONS,
  calculateMean,
  calculatePercentile,
  calculateStdDev,
  computeSimulationMetrics,
};
