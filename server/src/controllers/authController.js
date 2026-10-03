import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return sendSuccess(res, result, 'User registered successfully', 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  return sendSuccess(res, result, 'Login successful', 200);
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  // req.user is attached by protect middleware
  return sendSuccess(res, req.user, 'Current user profile retrieved', 200);
});
