import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for console output
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const serviceStr = service ? `[${service}]` : '';
    return `${timestamp} ${level} ${serviceStr}: ${message} ${metaStr}`;
  }),
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: consoleFormat,
  }),

  // Error log file (daily rotation)
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  }),

  // Combined log file (daily rotation)
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
  }),
];

// Add debug log file in development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'debug-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'debug',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true,
    }),
  );
}

// Create the logger
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports,
  exitOnError: false,
});

// Create child loggers for different services
const createServiceLogger = serviceName => {
  return logger.child({ service: serviceName });
};

// Helper functions for different log levels
const logHelpers = {
  error: (message, meta = {}, service = null) => {
    const loggerInstance = service ? createServiceLogger(service) : logger;
    loggerInstance.error(message, meta);
  },

  warn: (message, meta = {}, service = null) => {
    const loggerInstance = service ? createServiceLogger(service) : logger;
    loggerInstance.warn(message, meta);
  },

  info: (message, meta = {}, service = null) => {
    const loggerInstance = service ? createServiceLogger(service) : logger;
    loggerInstance.info(message, meta);
  },

  debug: (message, meta = {}, service = null) => {
    const loggerInstance = service ? createServiceLogger(service) : logger;
    loggerInstance.debug(message, meta);
  },
};

// Express middleware for request logging
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    service: 'HTTP',
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const duration = Date.now() - start;

    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      service: 'HTTP',
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error logging middleware for Express
const errorLogger = (err, req, res, next) => {
  logger.error('Express error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    service: 'HTTP',
  });
  next(err);
};

// Graceful shutdown logging
const setupGracefulShutdown = () => {
  const gracefulShutdown = signal => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`, {
      service: 'SYSTEM',
    });

    // Close winston transports
    logger.end(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

export default logger;
export {
  createServiceLogger,
  logHelpers,
  requestLogger,
  errorLogger,
  setupGracefulShutdown,
};
