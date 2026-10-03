import { sendSuccess } from '../utils/apiResponse.js';
import { getConnectionStatus } from '../config/db.js';

export const getHealthStatus = (req, res) => {
  const dbStatus = getConnectionStatus();

  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
  };

  return sendSuccess(res, healthData, 'Server is running normally', 200);
};
