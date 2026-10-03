import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

// Setup connection event listeners
mongoose.connection.on('connected', () => {
  logger.info(`MongoDB connection established: ${mongoose.connection.host}`);
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB runtime connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost/disconnected.');
});

/**
 * Returns readable connection status string.
 */
export const getConnectionStatus = () => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
};

/**
 * Connect to MongoDB Atlas cluster using Mongoose.
 */
export const connectDB = async () => {
  if (!config.mongoUri) {
    const errorMsg = 'MONGO_URI is not configured in environment variables. Database connection cannot be established.';
    logger.error(errorMsg);
    if (config.isProduction) {
      logger.error('Fatal: Cannot operate in production without MONGO_URI. Exiting.');
      process.exit(1);
    }
    return null;
  }

  // Enforce cloud database in production - must be MongoDB Atlas beginning with mongodb+srv://
  if (config.isProduction) {
    if (!config.mongoUri.startsWith('mongodb+srv://')) {
      logger.error('Fatal: In production, MONGO_URI must be a MongoDB Atlas connection string starting with mongodb+srv://');
      process.exit(1);
    }
    if (config.mongoUri.includes('localhost') || config.mongoUri.includes('127.0.0.1')) {
      logger.error('Fatal: Localhost MongoDB URI detected in production mode. Production requires a cloud MongoDB Atlas URI via MONGO_URI.');
      process.exit(1);
    }
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    // Explicitly rethrow or exit based on production requirement to prevent silent failure
    if (config.isProduction) {
      logger.error('Fatal: Cannot operate in production without a working database connection. Exiting.');
      process.exit(1);
    }
    throw error;
  }
};

/**
 * Gracefully disconnect from MongoDB.
 */
export const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logger.info('MongoDB connection successfully closed.');
    }
  } catch (error) {
    logger.error('Error during MongoDB disconnection:', error.message);
    throw error;
  }
};
