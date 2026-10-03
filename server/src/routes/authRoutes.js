import { Router } from 'express';
import { requireBodyFields } from '../middleware/validate.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  register,
  login,
  getCurrentUser,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', requireBodyFields(['name', 'email', 'password']), register);
router.post('/login', requireBodyFields(['email', 'password']), login);
router.get('/me', protect, getCurrentUser);

export default router;
