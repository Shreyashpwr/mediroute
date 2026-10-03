import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  createFacility,
  getFacilities,
  getFacilityById,
  updateFacility,
  deleteFacility,
} from '../controllers/facilityController.js';

const router = Router();

// Protect all operational facility routes
router.use(protect);

router.route('/')
  .get(getFacilities)
  .post(authorize('admin', 'dispatcher', 'medical_staff'), requireBodyFields(['name', 'location']), createFacility);

router.route('/:id')
  .get(getFacilityById)
  .put(authorize('admin', 'dispatcher', 'medical_staff'), updateFacility)
  .delete(authorize('admin'), deleteFacility);

export default router;
