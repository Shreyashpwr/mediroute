import User from '../models/User.js';
import AppError from '../utils/appError.js';

export const createUser = async (userData, creatorAdminId = null) => {
  const existing = await User.findOne({ email: userData.email.toLowerCase() });
  if (existing) {
    throw new AppError('A user with this email address already exists', 400);
  }
  if (!userData.password) {
    userData.password = 'DefaultP@ss123';
  }

  // If created directly by an administrator, automatically mark approved
  if (creatorAdminId) {
    userData.approvalStatus = 'approved';
    userData.approvedAt = new Date();
    userData.approvedBy = creatorAdminId;
  }

  return await User.create(userData);
};

export const getAllUsers = async (filters = {}) => {
  const query = {};
  if (filters.role && filters.role !== 'all') {
    query.role = filters.role;
  }
  if (filters.approvalStatus && filters.approvalStatus !== 'all') {
    query.approvalStatus = filters.approvalStatus;
  }
  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive === 'true' || filters.isActive === true;
  }
  return await User.find(query)
    .populate('approvedBy', 'name email')
    .sort({ createdAt: -1 });
};

export const getPendingUsers = async () => {
  return await User.find({ approvalStatus: 'pending' }).sort({ createdAt: -1 });
};

export const getUserById = async (id) => {
  const user = await User.findById(id).populate('approvedBy', 'name email');
  if (!user) {
    throw new AppError(`User not found with id: ${id}`, 404);
  }
  return user;
};

export const approveUser = async (id, adminId, roleOverride = null) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(`User not found with id: ${id}`, 404);
  }

  user.approvalStatus = 'approved';
  user.approvedAt = new Date();
  user.approvedBy = adminId;
  user.rejectionReason = null;

  if (roleOverride) {
    const validRoles = ['admin', 'dispatcher', 'medical_staff', 'transport_operator', 'driver', 'patient'];
    if (!validRoles.includes(roleOverride)) {
      throw new AppError(`Invalid role override: ${roleOverride}`, 400);
    }
    user.role = roleOverride;
  }

  await user.save();
  return user;
};

export const rejectUser = async (id, adminId, rejectionReason) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(`User not found with id: ${id}`, 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Cannot reject an administrator account', 400);
  }

  user.approvalStatus = 'rejected';
  user.approvedBy = adminId;
  user.approvedAt = new Date();
  user.rejectionReason = rejectionReason || 'Application criteria not met';

  await user.save();
  return user;
};

export const updateUserRole = async (id, newRole) => {
  const validRoles = ['admin', 'dispatcher', 'medical_staff', 'transport_operator', 'driver', 'patient'];
  if (!validRoles.includes(newRole)) {
    throw new AppError(`Invalid role: ${newRole}`, 400);
  }

  const user = await User.findByIdAndUpdate(
    id,
    { role: newRole },
    { new: true, runValidators: true }
  ).populate('approvedBy', 'name email');

  if (!user) {
    throw new AppError(`User not found with id: ${id}`, 404);
  }
  return user;
};

export const updateUser = async (id, updateData) => {
  // Prevent arbitrary alteration of approvalStatus via generic update
  delete updateData.approvalStatus;
  delete updateData.approvedAt;
  delete updateData.approvedBy;

  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate('approvedBy', 'name email');

  if (!user) {
    throw new AppError(`User not found with id: ${id}`, 404);
  }
  return user;
};
