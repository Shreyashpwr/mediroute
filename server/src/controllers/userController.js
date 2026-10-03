import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as userService from '../services/userService.js';

export const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req.user?._id);
  return sendSuccess(res, user, 'User registered successfully', 201);
});

export const getUsers = asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers(req.query);
  return sendSuccess(res, users, 'Users retrieved successfully', 200);
});

export const getPendingUsers = asyncHandler(async (req, res) => {
  const users = await userService.getPendingUsers();
  return sendSuccess(res, users, 'Pending users retrieved successfully', 200);
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  return sendSuccess(res, user, 'User details retrieved', 200);
});

export const approveUser = asyncHandler(async (req, res) => {
  const user = await userService.approveUser(
    req.params.id,
    req.user._id,
    req.body?.role
  );
  return sendSuccess(res, user, `User account ${user.email} approved successfully`, 200);
});

export const rejectUser = asyncHandler(async (req, res) => {
  const user = await userService.rejectUser(
    req.params.id,
    req.user._id,
    req.body?.rejectionReason
  );
  return sendSuccess(res, user, `User account ${user.email} has been rejected`, 200);
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const user = await userService.updateUserRole(req.params.id, req.body.role);
  return sendSuccess(res, user, `User role updated to ${user.role}`, 200);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  return sendSuccess(res, user, 'User updated successfully', 200);
});
