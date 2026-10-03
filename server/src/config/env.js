import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly ensure dotenv resolves server/.env regardless of CWD
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev_fallback_secret_not_for_production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  isProduction: process.env.NODE_ENV === 'production',
};

/**
 * Validates presence of essential environment variables without leaking secrets.
 * @returns {object} Summary of configured vs missing variables
 */
export const validateEnv = () => {
  const isProd = config.isProduction;
  const summary = {
    PORT: config.port ? `Set (${config.port})` : 'Missing (defaulting to 5000)',
    CLIENT_URL: config.clientUrl ? `Set (${config.clientUrl})` : isProd ? 'CRITICAL: Not set for production' : 'Defaulting to http://localhost:5173',
    MONGO_URI: config.mongoUri ? 'Configured [REDACTED]' : isProd ? 'CRITICAL: Not configured' : 'Not configured',
    GEMINI_API_KEY: config.geminiApiKey ? 'Configured [REDACTED]' : 'Not configured (fallback simulation active)',
    JWT_SECRET: config.jwtSecret && config.jwtSecret !== 'dev_fallback_secret_not_for_production'
      ? 'Configured [REDACTED]'
      : isProd ? 'CRITICAL: Missing or using insecure fallback in production' : 'Using development fallback',
  };
  return summary;
};
