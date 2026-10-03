import User from '../models/User.js';
import AppError from '../utils/appError.js';
import { generateToken } from '../utils/token.js';

/**
 * Register a new user
 */
export const register = async (userData) => {
  const { name, email, password, role, phone, medicalProfile } = userData;

  if (!password || password.length < 6) {
    throw new AppError('Password is required and must be at least 6 characters long', 400);
  }

  if (role === 'admin') {
    throw new AppError('Cannot assign admin role during public registration', 403);
  }

  const allowedPublicRoles = ['dispatcher', 'medical_staff', 'transport_operator', 'driver', 'patient'];
  const assignedRole = allowedPublicRoles.includes(role) ? role : 'dispatcher';

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email address already exists', 400);
  }

  const user = await User.create({
    name,
    email,
    password,
    role: assignedRole,
    phone,
    approvalStatus: 'pending',
    approvedAt: null,
    approvedBy: null,
    medicalProfile,
  });

  return {
    user: user.toJSON(),
    approvalStatus: 'pending',
    message: 'Your account is awaiting administrator approval.',
  };
};

/**
 * Authenticate user with email and password
 */
export const login = async (email, password) => {
  if (!email || !password) {
    throw new AppError('Please provide both email and password', 400);
  }

  // Explicitly select password which is excluded by default in schema
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  // Generic, secure authentication error message
  const authFailedMessage = 'Invalid email or password';

  if (!user) {
    throw new AppError(authFailedMessage, 401);
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new AppError(authFailedMessage, 401);
  }

  if (!user.isActive) {
    throw new AppError('Account is currently deactivated. Please contact support.', 403);
  }

  // Enforce account approval requirement
  if (user.approvalStatus === 'pending') {
    throw new AppError('Your account is awaiting administrator approval.', 403);
  }

  if (user.approvalStatus === 'rejected') {
    throw new AppError(
      `Your account registration was rejected. Reason: ${user.rejectionReason || 'Contact system administrator.'}`,
      403
    );
  }

  if (user.approvalStatus !== 'approved') {
    throw new AppError('Account is not approved to access operational data.', 403);
  }

  const token = generateToken(user._id);

  // Exclude password from returned user object
  const userResponse = user.toJSON();

  return {
    user: userResponse,
    token,
  };
};

/**
 * Get profile of currently authenticated user
 */
export const getCurrentUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
};
