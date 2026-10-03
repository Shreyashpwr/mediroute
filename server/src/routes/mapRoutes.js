import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getOperationalMapData } from '../controllers/mapController.js';

const router = Router();

// Protect operational map data endpoint
router.get('/operational-data', protect, getOperationalMapData);

export default router;
