import Ambulance from '../models/Ambulance.js';
import AppError from '../utils/appError.js';

export const getAllAmbulances = async (filters = {}) => {
  const query = { isActive: true };
  if (filters.status && filters.status !== 'all') {
    query.status = filters.status;
  }
  if (filters.vehicleType && filters.vehicleType !== 'all') {
    query.vehicleType = filters.vehicleType;
  }

  return await Ambulance.find(query)
    .populate('destinationFacility', 'name address emergencyCapacity')
    .populate('currentDispatch', 'dispatchNumber patientName triageLevel status')
    .populate('assignedDriver', 'name phone email')
    .sort({ ambulanceId: 1 });
};

export const getAmbulanceById = async (id) => {
  const ambulance = await Ambulance.findById(id)
    .populate('destinationFacility', 'name address emergencyCapacity')
    .populate('currentDispatch', 'dispatchNumber patientName triageLevel status')
    .populate('assignedDriver', 'name phone email');

  if (!ambulance) {
    throw new AppError(`Ambulance not found with id: ${id}`, 404);
  }
  return ambulance;
};

export const createAmbulance = async (ambulanceData) => {
  const existing = await Ambulance.findOne({
    ambulanceId: ambulanceData.ambulanceId?.toUpperCase()?.trim(),
  });
  if (existing) {
    throw new AppError(`Ambulance with registration ${ambulanceData.ambulanceId} already exists`, 400);
  }

  return await Ambulance.create(ambulanceData);
};

export const updateAmbulanceStatus = async (id, { status, destinationFacility, currentDispatch }) => {
  const updateData = {};
  if (status) updateData.status = status;
  if (destinationFacility !== undefined) updateData.destinationFacility = destinationFacility;
  if (currentDispatch !== undefined) updateData.currentDispatch = currentDispatch;

  const ambulance = await Ambulance.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('destinationFacility', 'name address emergencyCapacity')
    .populate('currentDispatch', 'dispatchNumber patientName triageLevel status');

  if (!ambulance) {
    throw new AppError(`Ambulance not found with id: ${id}`, 404);
  }
  return ambulance;
};

export const updateAmbulanceLocation = async (id, { latitude, longitude, address }) => {
  if (latitude === undefined || longitude === undefined) {
    throw new AppError('Latitude and longitude coordinates are required', 400);
  }

  const ambulance = await Ambulance.findByIdAndUpdate(
    id,
    {
      location: {
        type: 'Point',
        coordinates: [Number(longitude), Number(latitude)],
      },
      ...(address ? { address } : {}),
    },
    { new: true, runValidators: true }
  );

  if (!ambulance) {
    throw new AppError(`Ambulance not found with id: ${id}`, 404);
  }
  return ambulance;
};
