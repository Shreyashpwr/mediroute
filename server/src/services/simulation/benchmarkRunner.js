/**
 * MediRoute Comparative Benchmark Suite Orchestrator.
 *
 * Runs all three dispatch algorithms across an identical, reproducible scenario:
 * 1. Proposed Multi-Criteria Allocation with Deterministic A*
 * 2. Nearest Available Ambulance Baseline
 * 3. Shortest-Path Dijkstra Baseline
 *
 * Guarantees strictly equivalent scenario inputs and generates comparative delta analysis.
 */

import { generateScenarioIncidents, runSimulationScenario, SIMULATION_SCENARIOS } from './scenarioRunner.js';
import { ALGORITHM_POLICIES } from './baselines.js';
import { exportBenchmarkResults } from './exportBenchmark.js';
import logger from '../../utils/logger.js';

/**
 * Runs comparative benchmark across all three algorithms on an identical incident stream.
 *
 * @param {Object} options
 * @param {string|number} [options.seed=42] - Reproducible seed
 * @param {string} [options.scenarioId='standard_day'] - Scenario key
 * @param {number} [options.incidentCount] - Optional incident count limit
 * @param {number} [options.durationMinutes] - Optional duration limit
 * @param {boolean} [options.exportFiles=true] - Whether to write JSON/CSV files to disk
 * @returns {Promise<Object>} Comparative benchmark analysis
 */
export const runComparativeBenchmark = async ({
  seed = 42,
  scenarioId = 'standard_day',
  incidentCount = null,
  durationMinutes = null,
  exportFiles = true,
  outputDir = undefined,
} = {}) => {
  const scenario = SIMULATION_SCENARIOS[scenarioId] || SIMULATION_SCENARIOS.standard_day;
  const simDuration = durationMinutes || scenario.durationMinutes || 120;

  logger.info(`[Benchmark Suite] Starting comparative benchmark: Scenario='${scenario.name}', Seed=${seed}, Duration=${simDuration}m`);

  // 1. Pre-generate deterministic incident stream so ALL algorithms receive strictly identical inputs
  const commonIncidents = generateScenarioIncidents({
    seed,
    scenarioId,
    incidentCount,
    durationMinutes: simDuration,
  });

  logger.info(`[Benchmark Suite] Generated ${commonIncidents.length} identical synthetic incidents for evaluation.`);

  // 2. Execute Proposed Algorithm
  const proposedRun = await runSimulationScenario({
    algorithm: ALGORITHM_POLICIES.PROPOSED,
    seed,
    scenarioId,
    durationMinutes: simDuration,
    preGeneratedIncidents: commonIncidents,
  });

  // 3. Execute Nearest Available Ambulance Baseline
  const nearestRun = await runSimulationScenario({
    algorithm: ALGORITHM_POLICIES.NEAREST_AVAILABLE,
    seed,
    scenarioId,
    durationMinutes: simDuration,
    preGeneratedIncidents: commonIncidents,
  });

  // 4. Execute Shortest-Path Dijkstra Baseline
  const dijkstraRun = await runSimulationScenario({
    algorithm: ALGORITHM_POLICIES.SHORTEST_PATH_DIJKSTRA,
    seed,
    scenarioId,
    durationMinutes: simDuration,
    preGeneratedIncidents: commonIncidents,
  });

  // 5. Compute Comparative Performance Summary
  const proposedPerf = proposedRun.metrics.performanceMetrics;
  const nearestPerf = nearestRun.metrics.performanceMetrics;
  const dijkstraPerf = dijkstraRun.metrics.performanceMetrics;

  const comparison = {
    meanResponseTimeDeltaVsNearestMinutes: Number(
      (proposedPerf.meanResponseTimeMinutes - nearestPerf.meanResponseTimeMinutes).toFixed(3)
    ),
    meanResponseTimeDeltaVsDijkstraMinutes: Number(
      (proposedPerf.meanResponseTimeMinutes - dijkstraPerf.meanResponseTimeMinutes).toFixed(3)
    ),
    p95ResponseTimeDeltaVsNearestMinutes: Number(
      (proposedPerf.p95ResponseTimeMinutes - nearestPerf.p95ResponseTimeMinutes).toFixed(3)
    ),
    p95ResponseTimeDeltaVsDijkstraMinutes: Number(
      (proposedPerf.p95ResponseTimeMinutes - dijkstraPerf.p95ResponseTimeMinutes).toFixed(3)
    ),
    unservedRateDeltaVsNearest: Number(
      (proposedRun.metrics.serviceLevelMetrics.unservedIncidentRate - nearestRun.metrics.serviceLevelMetrics.unservedIncidentRate).toFixed(4)
    ),
    unservedRateDeltaVsDijkstra: Number(
      (proposedRun.metrics.serviceLevelMetrics.unservedIncidentRate - dijkstraRun.metrics.serviceLevelMetrics.unservedIncidentRate).toFixed(4)
    ),
  };

  const benchmarkResult = {
    benchmarkTitle: `MediRoute Dispatch & Routing Benchmark: ${scenario.name}`,
    scenarioId,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    seed,
    durationMinutes: simDuration,
    totalIncidents: commonIncidents.length,
    timestamp: new Date().toISOString(),
    isSimulatedData: true,
    simulationNotice: 'ALL DATA IN THIS BENCHMARK IS SYNTHETICALLY GENERATED FOR ALGORITHM COMPARISON',
    comparison,
    algorithmRuns: {
      proposed: {
        label: 'Proposed Multi-Criteria Allocation + A*',
        metrics: proposedRun.metrics,
        eventLogCount: proposedRun.eventLog.length,
        eventLog: proposedRun.eventLog.slice(0, 100), // top 100 events in summary
      },
      nearest_available: {
        label: 'Nearest Available Ambulance Baseline',
        metrics: nearestRun.metrics,
        eventLogCount: nearestRun.eventLog.length,
        eventLog: nearestRun.eventLog.slice(0, 100),
      },
      shortest_path_dijkstra: {
        label: 'Shortest-Path Dijkstra Baseline',
        metrics: dijkstraRun.metrics,
        eventLogCount: dijkstraRun.eventLog.length,
        eventLog: dijkstraRun.eventLog.slice(0, 100),
      },
    },
  };

  // 6. Export to disk if requested
  let exportFilesInfo = null;
  if (exportFiles) {
    try {
      exportFilesInfo = exportBenchmarkResults(benchmarkResult, outputDir);
      benchmarkResult.exportFiles = exportFilesInfo;
      logger.info(`[Benchmark Suite] Saved benchmark results to ${exportFilesInfo.jsonPath}`);
    } catch (err) {
      logger.error(`[Benchmark Suite] Failed to export benchmark files: ${err.message}`);
    }
  }

  return benchmarkResult;
};

export default {
  runComparativeBenchmark,
};
