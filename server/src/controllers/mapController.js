import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as mapService from '../services/mapService.js';

export const getOperationalMapData = asyncHandler(async (req, res) => {
  const mapData = await mapService.getOperationalMapData();
  return sendSuccess(res, mapData, 'Operational map data retrieved successfully', 200);
});
