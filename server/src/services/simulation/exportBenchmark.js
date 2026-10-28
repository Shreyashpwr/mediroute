/**
 * MediRoute Benchmark Export Engine.
 * Exports simulation results and event logs to standardized JSON and CSV formats.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_BENCHMARK_DIR = path.resolve(__dirname, '../../../benchmarks');

/**
 * Ensures benchmark output directory exists.
 */
export const ensureBenchmarkDir = (dirPath = DEFAULT_BENCHMARK_DIR) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

/**
 * Converts comparative benchmark results to a formatted CSV string.
 * @param {Object} comparativeResults
 * @returns {string} CSV content
 */
export const formatSummaryCsv = (comparativeResults) => {
  const headers = [
    'Algorithm',
    'Scenario',
    'Seed',
    'TotalIncidents',
    'CompletedIncidents',
    'UnservedIncidents',
    'UnservedRate',
    'MeanResponseTimeMin',
    'MedianResponseTimeMin',
    'P95ResponseTimeMin',
    'MeanTransitTimeMin',
    'RouteCorrectness',
    'AmbulanceUtilization',
    'FacilityBedUtilization',
    'AvgAlgorithmComputeMs',
    'Timestamp',
  ];

  const rows = [];
  const runs = comparativeResults.algorithmRuns || {};

  for (const [algoKey, run] of Object.entries(runs)) {
    const perf = run.metrics?.performanceMetrics || {};
    const serv = run.metrics?.serviceLevelMetrics || {};
    const util = run.metrics?.utilizationMetrics || {};
    const comp = run.metrics?.computationalMetrics || {};
    const samp = run.metrics?.sampleSize || {};

    rows.push([
      algoKey,
      comparativeResults.scenarioId || 'standard_day',
      comparativeResults.seed,
      samp.totalIncidents ?? 0,
      samp.completedIncidentCount ?? 0,
      samp.unservedIncidentCount ?? 0,
      serv.unservedIncidentRate ?? 0,
      perf.meanResponseTimeMinutes ?? 0,
      perf.medianResponseTimeMinutes ?? 0,
      perf.p95ResponseTimeMinutes ?? 0,
      perf.meanTransitTimeMinutes ?? 0,
      serv.routeCorrectness ?? 1,
      util.ambulanceUtilization ?? 0,
      util.facilityBedUtilization ?? 0,
      comp.averageAlgorithmComputeTimeMs ?? 0,
      comparativeResults.timestamp || new Date().toISOString(),
    ].join(','));
  }

  return [headers.join(','), ...rows].join('\n');
};

/**
 * Converts detailed event logs to CSV format.
 * @param {Array} eventLog
 * @param {string} algorithm
 * @returns {string} CSV content
 */
export const formatEventLogCsv = (eventLog = [], algorithm = 'proposed') => {
  const headers = [
    'TimeMinutes',
    'Algorithm',
    'EventType',
    'IncidentId',
    'AmbulanceId',
    'FacilityId',
    'ResponseTimeMinutes',
    'ComputeTimeMs',
  ];

  const rows = eventLog.map((e) => {
    const d = e.data || {};
    return [
      e.time,
      algorithm,
      e.eventType,
      d.incidentId || '',
      d.ambulanceId || '',
      d.facilityId || '',
      d.responseTimeMinutes ?? '',
      d.computeTimeMs ?? '',
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
};

/**
 * Saves full comparative benchmark run to JSON and CSV files.
 *
 * @param {Object} comparativeResults
 * @param {string} [outputDir]
 * @returns {Object} File paths of saved artifacts
 */
export const exportBenchmarkResults = (comparativeResults, outputDir = DEFAULT_BENCHMARK_DIR) => {
  ensureBenchmarkDir(outputDir);

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `benchmark_${timestampStr}_seed${comparativeResults.seed}`;

  const jsonPath = path.join(outputDir, `${baseFilename}.json`);
  const summaryCsvPath = path.join(outputDir, `${baseFilename}_summary.csv`);
  const proposedEventsCsvPath = path.join(outputDir, `${baseFilename}_proposed_events.csv`);

  // 1. Write full structured JSON
  fs.writeFileSync(jsonPath, JSON.stringify(comparativeResults, null, 2), 'utf8');

  // 2. Write summary CSV
  const summaryCsv = formatSummaryCsv(comparativeResults);
  fs.writeFileSync(summaryCsvPath, summaryCsv, 'utf8');

  // 3. Write proposed algorithm event log CSV
  const proposedRun = comparativeResults.algorithmRuns?.proposed;
  if (proposedRun?.eventLog) {
    const eventsCsv = formatEventLogCsv(proposedRun.eventLog, 'proposed');
    fs.writeFileSync(proposedEventsCsvPath, eventsCsv, 'utf8');
  }

  return {
    jsonPath,
    summaryCsvPath,
    proposedEventsCsvPath,
    baseFilename,
    timestamp: comparativeResults.timestamp,
  };
};

export default {
  DEFAULT_BENCHMARK_DIR,
  ensureBenchmarkDir,
  formatSummaryCsv,
  formatEventLogCsv,
  exportBenchmarkResults,
};
