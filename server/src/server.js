import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app, { buildAllowedOrigins } from './app.js';
import { config } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './utils/logger.js';
import { bootstrapAdmin } from './utils/bootstrapAdmin.js';

let io = null;

const startServer = async () => {
  // Validate production environment requirements
  if (config.isProduction) {
    if (!config.jwtSecret || config.jwtSecret === 'dev_fallback_secret_not_for_production') {
      logger.error('Fatal: JWT_SECRET environment variable is required in production.');
      process.exit(1);
    }
    if (!config.mongoUri || !config.mongoUri.startsWith('mongodb+srv://')) {
      logger.error('Fatal: In production, MONGO_URI must be a MongoDB Atlas connection string starting with mongodb+srv://');
      process.exit(1);
    }
    if (!config.clientUrl) {
      logger.warn('Warning: CLIENT_URL is not set. Frontend requests may be blocked by CORS in production.');
    }
  }

  // Attempt to connect to Database
  try {
    const conn = await connectDB();
    if (conn) {
      await bootstrapAdmin();
    }
  } catch (error) {
    logger.error('Failed to establish initial MongoDB connection:', error.message);
    if (config.isProduction) {
      process.exit(1);
    }
  }

  // Create HTTP server wrapping Express app
  const httpServer = http.createServer(app);

  // Initialize Socket.io on the HTTP server with identical CORS rules
  const allowedOrigins = buildAllowedOrigins();
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalizedOrigin = origin.replace(/\/+$/, '');
        if (allowedOrigins.has(normalizedOrigin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by Socket.io CORS`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket.io client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.info(`Socket.io client disconnected: ${socket.id}`);
    });
  });

  // Listen on 0.0.0.0 and process.env.PORT
  httpServer.listen(config.port, '0.0.0.0', () => {
    logger.info(`MediRoute server running in ${config.nodeEnv} mode on 0.0.0.0:${config.port}`);
    logger.info(`Socket.io initialized and operational on port ${config.port}`);
  });

  const handleShutdown = async (signal) => {
    logger.info(`${signal} signal received. Gracefully closing server...`);
    if (io) {
      io.close(() => {
        logger.info('Socket.io server closed.');
      });
    }
    httpServer.close(async () => {
      logger.info('HTTP server closed.');
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
};

startServer().catch((err) => {
  logger.error('Fatal error during server startup:', err);
  process.exit(1);
});

export { io };

