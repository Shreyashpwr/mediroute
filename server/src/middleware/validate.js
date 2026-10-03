import { sendError } from '../utils/apiResponse.js';

/**
 * Middleware factory to validate required fields in req.body
 * @param {Array<string>} requiredFields - List of required keys in body
 */
export const requireBodyFields = (requiredFields = []) => {
  return (req, res, next) => {
    const missing = [];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return sendError(
        res,
        `Missing required field(s): ${missing.join(', ')}`,
        400,
        missing.map((f) => `${f} is required`)
      );
    }

    next();
  };
};

export default {
  requireBodyFields,
};
