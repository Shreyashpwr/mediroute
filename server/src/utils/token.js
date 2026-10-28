import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Generate a signed JWT for a given user ID
 * @param {string} userId
 * @returns {string} Signed JWT token
 */
export const generateToken = (userId) => {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign({ id: userId }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
};

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {object} Decoded token payload
 */
export const verifyToken = (token) => {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
  });
};

export default {
  generateToken,
  verifyToken,
};
