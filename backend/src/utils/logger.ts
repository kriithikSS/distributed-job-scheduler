import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'job-scheduler' },
  transports: [
    new winston.transports.Console({
      format:
        config.nodeEnv === 'production'
          ? combine(timestamp(), json())
          : combine(colorize(), simple()),
    }),
  ],
});

export default logger;
