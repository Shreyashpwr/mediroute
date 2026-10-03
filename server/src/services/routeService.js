import RouteLog from '../models/RouteLog.js';
import Dispatch from '../models/Dispatch.js';
import AppError from '../utils/appError.js';

export const createRouteLog = async (data) => {
  // Verify dispatch exists
  const dispatch = await Dispatch.findById(data.dispatch);
  if (!dispatch) {
    throw new AppError(`Referenced dispatch not found with id: ${data.dispatch}`, 404);
  }

  return await RouteLog.create(data);
};

export const getRoutesByDispatch = async (dispatchId) => {
  const routes = await RouteLog.find({ dispatch: dispatchId })
    .populate('dispatch', 'dispatchNumber patientName triageLevel status')
    .sort({ createdAt: -1 });

  return routes;
};

export const getRouteById = async (id) => {
  const route = await RouteLog.findById(id).populate('dispatch');
  if (!route) {
    throw new AppError(`Route log not found with id: ${id}`, 404);
  }
  return route;
};
