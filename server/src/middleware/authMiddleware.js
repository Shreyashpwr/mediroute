import { verifyToken } from '../utils/token.js';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import { asyncHandler } from './asyncHandler.js';

/**
 * Protect routes: requires valid JWT in Authorization Bearer header
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Authentication required. No token provided.', 401);
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw new AppError('The user belonging to this token no longer exists.', 401);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated.', 403);
    }

    if (user.approvalStatus === 'pending') {
      throw new AppError('Your account is awaiting administrator approval.', 403);
    }

    if (user.approvalStatus === 'rejected') {
      throw new AppError(
        `Your account registration was rejected. Reason: ${user.rejectionReason || 'Contact administrator.'}`,
        403
      );
    }

    if (user.approvalStatus !== 'approved') {
      throw new AppError('Account is not approved to access operational data.', 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token. Please log in again.', 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token has expired. Please log in again.', 401);
    }
    throw error;
  }
});

/**
 * Authorize specific roles
 * @param  {...string} roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied: role '${req.user?.role}' is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};

export default {
  protect,
  authorize,
};
