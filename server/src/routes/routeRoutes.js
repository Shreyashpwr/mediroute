import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  createRouteLog,
  getRoutesByDispatch,
  getRouteById,
} from '../controllers/routeController.js';

const router = Router();

router.route('/')
  .post(protect, authorize('admin', 'dispatcher', 'driver'), requireBodyFields(['dispatch', 'origin', 'destination']), createRouteLog);

router.route('/:id')
  .get(protect, getRouteById);

router.route('/dispatch/:dispatchId')
  .get(protect, getRoutesByDispatch);

export default router;
