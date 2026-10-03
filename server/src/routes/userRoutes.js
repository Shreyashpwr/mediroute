import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  createUser,
  getUsers,
  getPendingUsers,
  getUserById,
  approveUser,
  rejectUser,
  updateUserRole,
  updateUser,
} from '../controllers/userController.js';

const router = Router();

// Protect all user routes with JWT authentication
router.use(protect);

// Specific admin approval routes (must come before /:id)
router.get('/pending', authorize('admin'), getPendingUsers);
router.patch('/:id/approve', authorize('admin'), approveUser);
router.patch('/:id/reject', authorize('admin'), rejectUser);
router.patch('/:id/role', authorize('admin'), requireBodyFields(['role']), updateUserRole);

// General user management
router.route('/')
  .get(authorize('admin', 'dispatcher'), getUsers)
  .post(authorize('admin'), requireBodyFields(['name', 'email']), createUser);

router.route('/:id')
  .get(authorize('admin', 'dispatcher'), getUserById)
  .put(authorize('admin'), updateUser);

export default router;
