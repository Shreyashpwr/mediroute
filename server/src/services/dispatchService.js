import Dispatch from '../models/Dispatch.js';
import AppError from '../utils/appError.js';

/**
 * Generate a unique human-readable dispatch number: DISP-YYYYMMDD-XXXX
 */
const generateDispatchNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `DISP-${dateStr}-${randomSuffix}`;
};

export const createDispatch = async (data) => {
  if (!data.dispatchNumber) {
    data.dispatchNumber = await generateDispatchNumber();
  }
  const created = await Dispatch.create(data);
  return await Dispatch.findById(created._id)
    .populate('patient', 'name email phone medicalProfile')
    .populate('destinationFacility', 'name facilityType location address emergencyCapacity')
    .populate('assignedDriver', 'name phone');
};

export const getAllDispatches = async (filters = {}) => {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.triageLevel) {
    query.triageLevel = filters.triageLevel;
  }

  if (filters.driverId) {
    query.assignedDriver = filters.driverId;
  }

  if (filters.facilityId) {
    query.destinationFacility = filters.facilityId;
  }

  return await Dispatch.find(query)
    .populate('patient', 'name email phone medicalProfile')
    .populate('destinationFacility', 'name facilityType location address emergencyCapacity')
    .populate('assignedDriver', 'name phone')
    .sort({ createdAt: -1 });
};

export const getDispatchById = async (id) => {
  const dispatch = await Dispatch.findById(id)
    .populate('patient', 'name email phone medicalProfile')
    .populate('destinationFacility', 'name facilityType location address emergencyCapacity')
    .populate('assignedDriver', 'name phone');

  if (!dispatch) {
    throw new AppError(`Dispatch not found with id: ${id}`, 404);
  }
  return dispatch;
};

export const updateDispatchStatus = async (id, status) => {
  const validStatuses = ['pending', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new AppError(
      `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
      400
    );
  }

  const dispatch = await Dispatch.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  )
    .populate('patient', 'name phone')
    .populate('destinationFacility', 'name address')
    .populate('assignedDriver', 'name phone');

  if (!dispatch) {
    throw new AppError(`Dispatch not found with id: ${id}`, 404);
  }
  return dispatch;
};

export const assignDispatch = async (id, { driverId, facilityId }) => {
  const updates = {};
  if (driverId) {
    updates.assignedDriver = driverId;
    updates.status = 'assigned';
  }
  if (facilityId) {
    updates.destinationFacility = facilityId;
  }

  const dispatch = await Dispatch.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('destinationFacility', 'name facilityType')
    .populate('assignedDriver', 'name phone');

  if (!dispatch) {
    throw new AppError(`Dispatch not found with id: ${id}`, 404);
  }
  return dispatch;
};
