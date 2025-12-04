import winston from 'winston';
import path from 'path';

const logDir = path.resolve(process.cwd(), 'backend', 'logs');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Simple log format for console
const simpleLogFormat = printf(({ level, message, timestamp, stack, correlationId }) => {
  const correlation = correlationId ? `[${correlationId}]` : '';
  return `${timestamp} ${correlation} [${level}]: ${stack || message}`;
});

// JSON log format for files (structured logging)
const jsonLogFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    winston.format.metadata()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), simpleLogFormat),
    }),
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      format: jsonLogFormat,
    }),
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      format: jsonLogFormat,
    }),
  ],
});

// Enhanced logging functions with correlation ID support
export const logInfo = (message: string, correlationId?: string, metadata?: Record<string, any>) => {
  logger.info(message, { correlationId, ...metadata });
};

export const logError = (message: string, correlationId?: string, metadata?: Record<string, any>) => {
  logger.error(message, { correlationId, ...metadata });
};

export const logWarn = (message: string, correlationId?: string, metadata?: Record<string, any>) => {
  logger.warn(message, { correlationId, ...metadata });
};

export const logDebug = (message: string, correlationId?: string, metadata?: Record<string, any>) => {
  logger.debug(message, { correlationId, ...metadata });
};

export default logger;
