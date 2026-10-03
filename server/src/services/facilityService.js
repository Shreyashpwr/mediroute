import Facility from '../models/Facility.js';
import AppError from '../utils/appError.js';

export const createFacility = async (data) => {
  return await Facility.create(data);
};

export const getAllFacilities = async (filters = {}) => {
  const query = {};

  if (filters.facilityType) {
    query.facilityType = filters.facilityType;
  }

  if (filters.status) {
    query['emergencyCapacity.status'] = filters.status;
  }

  if (filters.search) {
    query.name = { $regex: filters.search, $options: 'i' };
  }

  // Geospatial query near point [lng, lat]
  if (filters.lng && filters.lat) {
    const lng = parseFloat(filters.lng);
    const lat = parseFloat(filters.lat);
    const maxDistanceMeters = parseInt(filters.maxDistance, 10) || 50000; // default 50km

    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: maxDistanceMeters,
      },
    };
  }

  return await Facility.find(query).sort({ createdAt: -1 });
};

export const getFacilityById = async (id) => {
  const facility = await Facility.findById(id);
  if (!facility) {
    throw new AppError(`Facility not found with id: ${id}`, 404);
  }
  return facility;
};

export const updateFacility = async (id, updateData) => {
  const facility = await Facility.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  if (!facility) {
    throw new AppError(`Facility not found with id: ${id}`, 404);
  }
  return facility;
};

export const deleteFacility = async (id) => {
  const facility = await Facility.findByIdAndDelete(id);
  if (!facility) {
    throw new AppError(`Facility not found with id: ${id}`, 404);
  }
  return facility;
};
