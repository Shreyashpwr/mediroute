import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

const app = express();

// Whitelist allowed origins for CORS across development and production
export const buildAllowedOrigins = () => {
  const origins = new Set();

  // Always permit local Vite dev server
  origins.add('http://localhost:5173');
  origins.add('http://127.0.0.1:5173');

  // Permit configured production CLIENT_URL(s)
  if (config.clientUrl) {
    config.clientUrl
      .split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((url) => origins.add(url));
  }

  return origins;
};

export const allowedOrigins = buildAllowedOrigins();

// Security and utility middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests without origin header (e.g. Render health checks, curl, Postman)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/+$/, '');

      // Allow configured origins
      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      // In non-production mode, allow any localhost port
      if (!config.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // Reject all unauthorized origins in production
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

// REST API routes
app.use('/api', apiRouter);

// Root health check for Render/Cloud providers
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'MediRoute API is running' });
});

// 404 & Global Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
