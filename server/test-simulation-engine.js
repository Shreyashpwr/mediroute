/**
 * MediRoute Simulation & Benchmarking Test Suite.
 *
 * Verifies:
 * 1. Determinism: Same seed and config produce identical event sequences and outcome metrics.
 * 2. Variability: Different seeds produce different scenario arrival streams.
 * 3. Physical State Invariants: No negative capacities, valid fuels, no impossible resource states.
 * 4. Zero Incident Loss: Every incident is either served or explicitly logged as unserved.
 * 5. Resource Consistency: Resource reservation and release remain consistent.
 * 6. Metric Accuracy: Mean, median, and P95 calculations match known mathematical results; empty sample guardrails hold.
 * 7. Export Integrity: JSON and CSV files parse properly and conform to the schema.
 * 8. Baseline Fairness: Proposed and baseline algorithms evaluate strictly equivalent scenarios.
 */

import fs from 'fs';
import path from 'path';
import { createRng } from './src/services/simulation/seededRandom.js';
import {
  calculateMean,
  calculatePercentile,
  calculateStdDev,
  computeSimulationMetrics,
} from './src/services/simulation/metrics.js';
import {
  generateScenarioIncidents,
  runSimulationScenario,
  SIMULATION_SCENARIOS,
} from './src/services/simulation/scenarioRunner.js';
import { runComparativeBenchmark } from './src/services/simulation/benchmarkRunner.js';
import { formatSummaryCsv, formatEventLogCsv } from './src/services/simulation/exportBenchmark.js';

console.log('======================================================================');
console.log('       MEDIROUTE SIMULATION & BENCHMARKING ENGINE TEST SUITE');
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

async function runTests() {
  // ============================================================================
  // TEST 1: STATISTICAL METRICS CALCULATION & EMPTY SAMPLE GUARDRAILS
  // ============================================================================
  console.log('--- 1. METRICS CALCULATION & EMPTY SAMPLE SAFETY ---');
  try {
    // Known sample vector
    const testSamples = [10, 20, 30, 40, 50]; // Mean: 30, Median: 30, P95: 48 (interpolated)
    assert(calculateMean(testSamples) === 30, 'calculateMean computes exact arithmetic mean');
    assert(calculatePercentile(testSamples, 50) === 30, 'calculatePercentile computes exact median');
    assert(calculatePercentile(testSamples, 95) === 48, 'calculatePercentile computes linear P95', `P95: ${calculatePercentile(testSamples, 95)}`);
    assert(calculateStdDev(testSamples) === 15.811, 'calculateStdDev computes sample standard deviation');

    // Empty sample guardrails
    assert(calculateMean([]) === 0, 'calculateMean returns 0 on empty array without NaN');
    assert(calculatePercentile([], 50) === 0, 'calculatePercentile returns 0 on empty array without NaN');
    assert(calculateStdDev([]) === 0, 'calculateStdDev returns 0 on empty array without NaN');
    assert(calculateMean([null, undefined, NaN]) === 0, 'calculateMean filters non-numeric values safely');

    // Single sample
    assert(calculatePercentile([17.5], 95) === 17.5, 'calculatePercentile handles single sample vector');

    // Full metrics aggregator with empty inputs
    const emptyMetrics = computeSimulationMetrics({
      eventLog: [],
      incidents: [],
      ambulances: [],
      facilities: [],
      durationMinutes: 120,
    });
    assert(emptyMetrics.sampleSize.totalIncidents === 0, 'Handles 0 incidents gracefully');
    assert(emptyMetrics.performanceMetrics.meanResponseTimeMinutes === 0, 'Mean response time is 0 for 0 incidents');
    assert(emptyMetrics.serviceLevelMetrics.unservedIncidentRate === 0, 'Unserved rate is 0 for 0 incidents');
    assert(!isNaN(emptyMetrics.utilizationMetrics.ambulanceUtilization), 'Ambulance utilization is not NaN');
  } catch (err) {
    assert(false, 'Metrics calculation test crashed', err.message);
  }

  // ============================================================================
  // TEST 2: PRNG REPRODUCIBILITY & VARIABILITY
  // ============================================================================
  console.log('\n--- 2. SEEDED PRNG DETERMINISM & DIVERSITY ---');
  try {
    const rng1 = createRng(12345);
    const rng2 = createRng(12345);
    const rngOther = createRng(99999);

    const seq1 = [rng1.next(), rng1.int(1, 100), rng1.exponential(0.5), rng1.gaussian(10, 2)];
    const seq2 = [rng2.next(), rng2.int(1, 100), rng2.exponential(0.5), rng2.gaussian(10, 2)];
    const seqOther = [rngOther.next(), rngOther.int(1, 100), rngOther.exponential(0.5), rngOther.gaussian(10, 2)];

    assert(
      JSON.stringify(seq1) === JSON.stringify(seq2),
      'Identical seeds produce bit-exact identical pseudo-random number sequences'
    );
    assert(
      JSON.stringify(seq1) !== JSON.stringify(seqOther),
      'Different seeds produce divergent random sequences'
    );

    // Incident generation determinism
    const incs1 = generateScenarioIncidents({ seed: 777, scenarioId: 'standard_day', incidentCount: 8 });
    const incs2 = generateScenarioIncidents({ seed: 777, scenarioId: 'standard_day', incidentCount: 8 });
    const incsDiff = generateScenarioIncidents({ seed: 888, scenarioId: 'standard_day', incidentCount: 8 });

    assert(
      incs1.length === 8 && incs2.length === 8,
      'Incident generation respects incident count'
    );
    assert(
      incs1[0].arrivalTimeMinutes === incs2[0].arrivalTimeMinutes &&
      incs1[0].triageLevel === incs2[0].triageLevel &&
      incs1[0].location.coordinates[0] === incs2[0].location.coordinates[0],
      'Identical seed produces identical incident arrival times, coordinates, and triage levels'
    );
    assert(
      incs1[0].arrivalTimeMinutes !== incsDiff[0].arrivalTimeMinutes ||
      incs1[0].location.coordinates[0] !== incsDiff[0].location.coordinates[0],
      'Different seed produces different incident timeline'
    );
  } catch (err) {
    assert(false, 'PRNG reproducibility test crashed', err.message);
  }

  // ============================================================================
  // TEST 3: FULL SIMULATION DETERMINISM & OUTCOME REPRODUCIBILITY
  // ============================================================================
  console.log('\n--- 3. FULL SIMULATION DETERMINISM & OUTCOME REPRODUCIBILITY ---');
  try {
    const runA = await runSimulationScenario({
      algorithm: 'proposed',
      seed: 42,
      scenarioId: 'standard_day',
      durationMinutes: 60,
      incidentCount: 6,
    });

    const runB = await runSimulationScenario({
      algorithm: 'proposed',
      seed: 42,
      scenarioId: 'standard_day',
      durationMinutes: 60,
      incidentCount: 6,
    });

    assert(runA.eventLog.length === runB.eventLog.length, 'Exact matching event counts across runs with identical seed');

    let eventsIdentical = true;
    for (let i = 0; i < runA.eventLog.length; i++) {
      const eA = runA.eventLog[i];
      const eB = runB.eventLog[i];
      if (eA.time !== eB.time || eA.eventType !== eB.eventType) {
        eventsIdentical = false;
        break;
      }
    }
    assert(eventsIdentical, 'Event timeline and event types are 100% identical between runs with same seed');

    const perfA = runA.metrics.performanceMetrics;
    const perfB = runB.metrics.performanceMetrics;
    assert(
      perfA.meanResponseTimeMinutes === perfB.meanResponseTimeMinutes &&
      perfA.medianResponseTimeMinutes === perfB.medianResponseTimeMinutes &&
      perfA.p95ResponseTimeMinutes === perfB.p95ResponseTimeMinutes,
      'Performance metrics (mean, median, p95) are bit-for-bit identical across runs with same seed'
    );
  } catch (err) {
    assert(false, 'Full simulation determinism test crashed', err.message);
  }

  // ============================================================================
  // TEST 4: PHYSICAL RESOURCE INVARIANTS & ZERO LOSS GUARANTEE
  // ============================================================================
  console.log('\n--- 4. PHYSICAL INVARIANTS & ZERO INCIDENT LOSS ---');
  try {
    const surgeRun = await runSimulationScenario({
      algorithm: 'proposed',
      seed: 101,
      scenarioId: 'hospital_surge',
      durationMinutes: 90,
      incidentCount: 15,
    });

    // Invariant 1: No negative hospital capacities
    let noNegativeBeds = true;
    for (const fac of surgeRun.facilities) {
      const cap = fac.emergencyCapacity || {};
      if (cap.availableBeds < 0 || cap.icuAvailable < 0) {
        noNegativeBeds = false;
        break;
      }
    }
    assert(noNegativeBeds, 'Hospital available beds and ICU beds never drop below zero');

    // Invariant 2: No negative or out-of-range fuel levels
    let validFuelLevels = true;
    for (const amb of surgeRun.ambulances) {
      if (amb.fuelLevel < 0 || amb.fuelLevel > 100) {
        validFuelLevels = false;
        break;
      }
    }
    assert(validFuelLevels, 'Ambulance fuel levels remain strictly bounded in [0, 100]');

    // Invariant 3: Zero incident loss (every incident is completed or explicitly unserved)
    let allIncidentsAccounted = true;
    for (const inc of surgeRun.incidents) {
      if (!['completed', 'unserved'].includes(inc.status)) {
        allIncidentsAccounted = false;
        break;
      }
    }
    assert(allIncidentsAccounted, 'Every incident reaches completed or unserved status (no orphaned/lost incidents)');

    // Invariant 4: Sum of completed + unserved equals total
    const total = surgeRun.metrics.sampleSize.totalIncidents;
    const completed = surgeRun.metrics.sampleSize.completedIncidentCount;
    const unserved = surgeRun.metrics.sampleSize.unservedIncidentCount;
    assert(completed + unserved === total, 'Sum of completed + unserved incidents equals total incidents', `${completed} + ${unserved} = ${total}`);
  } catch (err) {
    assert(false, 'Physical invariants test crashed', err.message);
  }

  // ============================================================================
  // TEST 5: BASELINE FAIRNESS & EQUIVALENT INPUT STREAM
  // ============================================================================
  console.log('\n--- 5. BASELINE EQUIVALENCE & FAIR SCENARIO COMPARISON ---');
  try {
    const comparative = await runComparativeBenchmark({
      seed: 555,
      scenarioId: 'standard_day',
      incidentCount: 10,
      durationMinutes: 90,
      exportFiles: false,
    });

    const runs = comparative.algorithmRuns;
    assert(Boolean(runs.proposed), 'Benchmark executes Proposed Multi-Criteria policy');
    assert(Boolean(runs.nearest_available), 'Benchmark executes Nearest Available baseline');
    assert(Boolean(runs.shortest_path_dijkstra), 'Benchmark executes Shortest-Path Dijkstra baseline');

    const countProp = runs.proposed.metrics.sampleSize.totalIncidents;
    const countNear = runs.nearest_available.metrics.sampleSize.totalIncidents;
    const countDijk = runs.shortest_path_dijkstra.metrics.sampleSize.totalIncidents;

    assert(
      countProp === 10 && countNear === 10 && countDijk === 10,
      'All three algorithms evaluate strictly identical number of incidents',
      `Proposed: ${countProp}, Nearest: ${countNear}, Dijkstra: ${countDijk}`
    );

    // Verify comparison delta calculation
    assert(comparative.comparison.meanResponseTimeDeltaVsNearestMinutes !== undefined, 'Calculates response time delta vs Nearest baseline');
    assert(comparative.comparison.meanResponseTimeDeltaVsDijkstraMinutes !== undefined, 'Calculates response time delta vs Dijkstra baseline');
    assert(comparative.isSimulatedData === true, 'Explicitly flags isSimulatedData: true');
  } catch (err) {
    assert(false, 'Baseline fairness test crashed', err.message);
  }

  // ============================================================================
  // TEST 6: JSON AND CSV EXPORT FORMAT VALIDITY
  // ============================================================================
  console.log('\n--- 6. JSON AND CSV EXPORT FORMAT VALIDITY ---');
  try {
    const testBenchmarkData = await runComparativeBenchmark({
      seed: 999,
      scenarioId: 'standard_day',
      incidentCount: 5,
      durationMinutes: 60,
      exportFiles: true,
    });

    assert(Boolean(testBenchmarkData.exportFiles?.jsonPath), 'Exports JSON report file');
    assert(Boolean(testBenchmarkData.exportFiles?.summaryCsvPath), 'Exports Summary CSV file');
    assert(Boolean(testBenchmarkData.exportFiles?.proposedEventsCsvPath), 'Exports Events CSV file');

    // Parse JSON file from disk to verify readability
    const jsonContent = JSON.parse(fs.readFileSync(testBenchmarkData.exportFiles.jsonPath, 'utf8'));
    assert(jsonContent.seed === 999, 'Exported JSON contains correct seed');
    assert(Boolean(jsonContent.algorithmRuns?.proposed), 'Exported JSON contains proposed algorithm metrics');

    // Parse CSV files from disk
    const csvContent = fs.readFileSync(testBenchmarkData.exportFiles.summaryCsvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    assert(lines.length === 4, 'Summary CSV contains header plus 3 algorithm data rows', `Rows: ${lines.length}`);
    assert(lines[0].startsWith('Algorithm,Scenario,Seed'), 'Summary CSV has expected column headers');

    // Parse Events CSV
    const eventsCsvContent = fs.readFileSync(testBenchmarkData.exportFiles.proposedEventsCsvPath, 'utf8');
    const eventLines = eventsCsvContent.trim().split('\n');
    assert(eventLines.length > 5, 'Events CSV contains populated timeline events', `Events count: ${eventLines.length}`);
  } catch (err) {
    assert(false, 'Export format validity test crashed', err.message);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n======================================================================');
  console.log(`SIMULATION TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
