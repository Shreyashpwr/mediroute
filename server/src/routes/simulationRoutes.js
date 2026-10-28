import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  getSimulationScenarios,
  executeBenchmark,
  getLatestBenchmark,
  listBenchmarkRuns,
  getBenchmarkFile,
} from '../controllers/simulationController.js';

const router = Router();

// Protect all simulation endpoints to prevent unauthorized resource consumption
router.use(protect);

router.get('/scenarios', getSimulationScenarios);
router.get('/latest', getLatestBenchmark);
router.get('/history', listBenchmarkRuns);
router.get('/export/:filename', getBenchmarkFile);

router.post(
  '/benchmark',
  authorize('admin', 'dispatcher', 'medical_staff'),
  executeBenchmark
);

export default router;
