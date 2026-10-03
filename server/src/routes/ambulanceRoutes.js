import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  getAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulanceStatus,
  updateAmbulanceLocation,
} from '../controllers/ambulanceController.js';

const router = Router();

// Protect all ambulance endpoints
router.use(protect);

router.route('/')
  .get(getAmbulances)
  .post(
    authorize('admin', 'dispatcher'),
    requireBodyFields(['ambulanceId', 'location']),
    createAmbulance
  );

router.route('/:id')
  .get(getAmbulanceById);

router.route('/:id/status')
  .patch(
    authorize('admin', 'dispatcher', 'transport_operator', 'driver'),
    requireBodyFields(['status']),
    updateAmbulanceStatus
  );

router.route('/:id/location')
  .patch(
    authorize('admin', 'dispatcher', 'transport_operator', 'driver'),
    requireBodyFields(['latitude', 'longitude']),
    updateAmbulanceLocation
  );

export default router;
