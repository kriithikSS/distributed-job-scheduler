import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL!,

  worker: {
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10),
    heartbeatIntervalMs: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '5000', 10),
    recoveryIntervalMs: parseInt(process.env.WORKER_RECOVERY_INTERVAL_MS || '30000', 10),
    cronCheckIntervalMs: parseInt(process.env.CRON_CHECK_INTERVAL_MS || '10000', 10),
    stalledJobTimeoutMs: parseInt(process.env.STALLED_JOB_TIMEOUT_MS || '30000', 10),
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10', 10),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
  },
} as const;
