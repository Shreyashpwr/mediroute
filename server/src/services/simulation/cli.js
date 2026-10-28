#!/usr/bin/env node

/**
 * MediRoute Benchmark Suite CLI Runner.
 *
 * Usage:
 *   node src/services/simulation/cli.js [--seed 42] [--scenario standard_day] [--incidents 20] [--duration 120]
 *   npm run benchmark -- --seed 100 --scenario mass_casualty
 */

import { runComparativeBenchmark } from './benchmarkRunner.js';
import { SIMULATION_SCENARIOS } from './scenarioRunner.js';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    seed: 42,
    scenarioId: 'standard_day',
    incidentCount: null,
    durationMinutes: 120,
    outputDir: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--seed' || arg === '-s') && args[i + 1]) {
      options.seed = isNaN(Number(args[++i])) ? args[i] : Number(args[i]);
    } else if (arg.startsWith('--seed=')) {
      const val = arg.split('=')[1];
      options.seed = isNaN(Number(val)) ? val : Number(val);
    } else if ((arg === '--scenario' || arg === '-sc') && args[i + 1]) {
      options.scenarioId = args[++i];
    } else if (arg.startsWith('--scenario=')) {
      options.scenarioId = arg.split('=')[1];
    } else if ((arg === '--incidents' || arg === '-n') && args[i + 1]) {
      options.incidentCount = parseInt(args[++i], 10);
    } else if (arg.startsWith('--incidents=')) {
      options.incidentCount = parseInt(arg.split('=')[1], 10);
    } else if ((arg === '--duration' || arg === '-d') && args[i + 1]) {
      options.durationMinutes = parseInt(args[++i], 10);
    } else if (arg.startsWith('--duration=')) {
      options.durationMinutes = parseInt(arg.split('=')[1], 10);
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
MediRoute Simulation & Benchmark Suite CLI
==========================================
Options:
  --seed <number|string>   Configurable seed for strict reproducibility (default: 42)
  --scenario <name>        Scenario ID: 'standard_day', 'mass_casualty', 'arterial_gridlock', 'hospital_surge'
  --incidents <number>     Limit number of generated emergency incidents
  --duration <minutes>     Simulation timeline duration in minutes (default: 120)
  --output <dir>           Directory path for exported JSON and CSV benchmark logs
  --help, -h               Show this help message
      `);
      process.exit(0);
    } else if (!arg.startsWith('-') && i === 0 && !isNaN(Number(arg))) {
      options.seed = Number(arg);
    } else if (!arg.startsWith('-') && i === 1 && SIMULATION_SCENARIOS[arg]) {
      options.scenarioId = arg;
    }
  }

  return options;
};

const formatTable = (runs) => {
  const pad = (str, len) => String(str).padEnd(len);
  const padNum = (num, len) => String(num !== undefined && num !== null ? num : '-').padStart(len);

  const header = [
    pad('Algorithm', 32),
    padNum('Mean (m)', 10),
    padNum('P50 (m)', 10),
    padNum('P95 (m)', 10),
    padNum('Unserved', 10),
    padNum('Done', 8),
    padNum('Correct%', 10),
    padNum('Avg ms', 10),
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  const rows = Object.entries(runs).map(([key, data]) => {
    const p = data.metrics?.performanceMetrics || {};
    const s = data.metrics?.serviceLevelMetrics || {};
    const c = data.metrics?.computationalMetrics || {};
    const sz = data.metrics?.sampleSize || {};

    return [
      pad(data.label || key, 32),
      padNum(p.meanResponseTimeMinutes?.toFixed(1) ?? '-', 10),
      padNum(p.medianResponseTimeMinutes?.toFixed(1) ?? '-', 10),
      padNum(p.p95ResponseTimeMinutes?.toFixed(1) ?? '-', 10),
      padNum(`${((s.unservedIncidentRate || 0) * 100).toFixed(1)}%`, 10),
      padNum(sz.completedIncidentCount ?? 0, 8),
      padNum(`${((s.routeCorrectness || 1) * 100).toFixed(1)}%`, 10),
      padNum(c.averageAlgorithmComputeTimeMs?.toFixed(2) ?? '-', 10),
    ].join(' | ');
  });

  return [header, separator, ...rows].join('\n');
};

const run = async () => {
  const options = parseArgs();

  console.log('======================================================================');
  console.log('         MEDIROUTE SIMULATION & BENCHMARKING SUITE CLI');
  console.log('======================================================================\n');
  console.log(`[Configuration] Seed: ${options.seed}`);
  console.log(`[Configuration] Scenario: ${options.scenarioId} (${SIMULATION_SCENARIOS[options.scenarioId]?.name || 'Custom'})`);
  console.log(`[Configuration] Duration: ${options.durationMinutes} simulated minutes`);
  if (options.incidentCount) console.log(`[Configuration] Incident Cap: ${options.incidentCount}`);
  console.log('[Notice] ALL SIMULATION DATA IS SYNTHETIC FOR REPRODUCIBLE ALGORITHM COMPARISON.\n');

  console.log('Running comparative simulation across 3 dispatch policies...');
  const startWallClock = Date.now();

  try {
    const results = await runComparativeBenchmark({
      seed: options.seed,
      scenarioId: options.scenarioId,
      incidentCount: options.incidentCount,
      durationMinutes: options.durationMinutes,
      exportFiles: true,
      outputDir: options.outputDir,
    });

    const elapsedSeconds = ((Date.now() - startWallClock) / 1000).toFixed(2);
    console.log(`Simulation finished in ${elapsedSeconds}s.\n`);

    console.log('======================================================================');
    console.log('                    COMPARATIVE BENCHMARK RESULTS');
    console.log('======================================================================\n');
    console.log(formatTable(results.algorithmRuns));
    console.log('\n======================================================================');
    console.log(`Exported Files:`);
    if (results.exportFiles) {
      console.log(`  JSON Report:   ${results.exportFiles.jsonPath}`);
      console.log(`  Summary CSV:   ${results.exportFiles.summaryCsvPath}`);
      console.log(`  Events CSV:    ${results.exportFiles.proposedEventsCsvPath}`);
    }
    console.log('======================================================================\n');
  } catch (err) {
    console.error('Benchmark execution failed:', err);
    process.exit(1);
  }
};

run();
