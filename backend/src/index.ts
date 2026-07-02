import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import logger from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { authRateLimiter } from './middleware/rateLimiter';

import authRouter from './routes/auth';
import organizationsRouter from './routes/organizations';
import projectsRouter from './routes/projects';
import queuesRouter from './routes/queues';
import jobsRouter from './routes/jobs';
import workersRouter from './routes/workers';
import metricsRouter from './routes/metrics';

const app = express();

// Security & middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Rate limiting
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { type: 'https://httpstatuses.com/429', title: 'Too Many Requests', status: 429 },
}));

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/organizations/:orgId/projects', projectsRouter);
app.use('/api', queuesRouter);
app.use('/api', jobsRouter);
app.use('/api/workers', workersRouter);
app.use('/api', metricsRouter);

// Error handling
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`API server running on port ${config.port}`, {
    env: config.nodeEnv,
    port: config.port,
  });
});

export default app;
