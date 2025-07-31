// index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import apiRouter from './src/routes/api.js';
import logger, {
  requestLogger,
  errorLogger,
  setupGracefulShutdown,
} from './src/config/logger.js';

// --- Basic Server Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// Setup graceful shutdown
setupGracefulShutdown();

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Allow the server to understand JSON in request bodies
app.use(requestLogger); // Add request logging middleware

// --- Routes ---
// A simple health check route to make sure the server is running
app.get('/', (req, res) => {
  logger.info('Health check endpoint accessed', { service: 'API' });
  res.json({
    status: 'healthy',
    message: 'SQL Powerhouse server is running! 🚀',
    timestamp: new Date().toISOString(),
  });
});

// Use our API routes, prefixed with /api
app.use('/api', apiRouter);

// --- Error Handling Middleware ---
app.use(errorLogger);

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    service: 'API',
  });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    service: 'API',
  });
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found',
  });
});

// --- Start the Server ---
app.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    service: 'SYSTEM',
  });
});
