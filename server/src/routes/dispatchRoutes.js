import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  createDispatch,
  getDispatches,
  getDispatchById,
  updateDispatchStatus,
  assignDispatch,
} from '../controllers/dispatchController.js';

const router = Router();

// Protect all operational dispatch routes
router.use(protect);

router.route('/')
  .get(getDispatches)
  .post(
    authorize('admin', 'dispatcher', 'medical_staff', 'patient'),
    requireBodyFields(['patientName', 'pickupLocation']),
    createDispatch
  );

router.route('/:id')
  .get(getDispatchById);

router.route('/:id/status')
  .patch(
    authorize('admin', 'dispatcher', 'transport_operator', 'driver'),
    requireBodyFields(['status']),
    updateDispatchStatus
  );

router.route('/:id/assign')
  .patch(authorize('admin', 'dispatcher'), assignDispatch);

export default router;
