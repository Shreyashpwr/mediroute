import fs from 'fs';
import path from 'path';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import AppError from '../utils/appError.js';
import { runComparativeBenchmark } from '../services/simulation/benchmarkRunner.js';
import { SIMULATION_SCENARIOS } from '../services/simulation/scenarioRunner.js';
import { DEFAULT_BENCHMARK_DIR, ensureBenchmarkDir } from '../services/simulation/exportBenchmark.js';

/**
 * Returns available scenario definitions.
 */
export const getSimulationScenarios = asyncHandler(async (req, res) => {
  return sendSuccess(res, SIMULATION_SCENARIOS, 'Simulation scenario definitions retrieved', 200);
});

/**
 * Executes a comparative benchmark run.
 * Protected by authorization & input validation to prevent resource exhaustion.
 */
export const executeBenchmark = asyncHandler(async (req, res) => {
  const { seed = 42, scenarioId = 'standard_day', incidentCount = null, durationMinutes = 120 } = req.body;

  // Validation
  if (durationMinutes && (isNaN(durationMinutes) || durationMinutes < 10 || durationMinutes > 360)) {
    throw new AppError('Duration must be a number between 10 and 360 minutes', 400);
  }
  if (incidentCount && (isNaN(incidentCount) || incidentCount < 1 || incidentCount > 150)) {
    throw new AppError('Incident count must be between 1 and 150 incidents', 400);
  }
  if (scenarioId && !SIMULATION_SCENARIOS[scenarioId]) {
    throw new AppError(`Unknown scenario ID: '${scenarioId}'. Valid options: ${Object.keys(SIMULATION_SCENARIOS).join(', ')}`, 400);
  }

  const results = await runComparativeBenchmark({
    seed: isNaN(Number(seed)) ? String(seed) : Number(seed),
    scenarioId,
    incidentCount: incidentCount ? Number(incidentCount) : null,
    durationMinutes: Number(durationMinutes) || 120,
    exportFiles: true,
  });

  return sendSuccess(res, results, 'Comparative simulation benchmark executed successfully', 200);
});

/**
 * Retrieves the latest benchmark result from disk.
 */
export const getLatestBenchmark = asyncHandler(async (req, res) => {
  ensureBenchmarkDir();

  const files = fs
    .readdirSync(DEFAULT_BENCHMARK_DIR)
    .filter((f) => f.startsWith('benchmark_') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    // If no benchmarks on disk yet, run a fast default run to populate
    const defaultRun = await runComparativeBenchmark({
      seed: 42,
      scenarioId: 'standard_day',
      incidentCount: 15,
      durationMinutes: 120,
      exportFiles: true,
    });
    return sendSuccess(res, defaultRun, 'Initial benchmark generated and retrieved', 200);
  }

  const latestFile = path.join(DEFAULT_BENCHMARK_DIR, files[0]);
  const content = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

  return sendSuccess(res, content, 'Latest benchmark results retrieved', 200);
});

/**
 * Retrieves list of available benchmark runs.
 */
export const listBenchmarkRuns = asyncHandler(async (req, res) => {
  ensureBenchmarkDir();

  const files = fs
    .readdirSync(DEFAULT_BENCHMARK_DIR)
    .filter((f) => f.startsWith('benchmark_') && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 20)
    .map((filename) => {
      const stats = fs.statSync(path.join(DEFAULT_BENCHMARK_DIR, filename));
      return {
        filename,
        createdAt: stats.birthtime,
        sizeBytes: stats.size,
      };
    });

  return sendSuccess(res, files, 'Historical benchmark runs listed', 200);
});

/**
 * Downloads or retrieves specific benchmark export by filename.
 */
export const getBenchmarkFile = asyncHandler(async (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(DEFAULT_BENCHMARK_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    throw new AppError(`Benchmark file not found: ${safeFilename}`, 404);
  }

  if (safeFilename.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return sendSuccess(res, data, 'Benchmark file retrieved', 200);
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  return res.sendFile(filePath);
});
