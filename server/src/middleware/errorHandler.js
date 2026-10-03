import { logger } from '../utils/logger.js';
import { sendError } from '../utils/apiResponse.js';

export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log error
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    name: err.name,
    code: err.code,
  });

  // Mongoose bad ObjectId (CastError)
  if (err.name === 'CastError') {
    const message = `Resource not found with id: ${err.value}`;
    return sendError(res, message, 404);
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    const message = `Duplicate value entered for field(s): ${fields}. Please use unique values.`;
    return sendError(res, message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((val) => val.message);
    const message = 'Validation error occurred';
    return sendError(res, message, 400, errors);
  }

  // CORS authorization rejection
  if (err.message && err.message.includes('not allowed by CORS')) {
    return sendError(res, err.message, 403);
  }

  // Custom AppError
  if (err.isOperational) {
    return sendError(res, err.message, err.statusCode, err.errors);
  }

  // Fallback for unhandled server errors
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  return sendError(res, message, statusCode);
};

export default errorHandler;
