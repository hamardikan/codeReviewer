'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const fs = require('fs-extra');

const config = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const reviewRoutes = require('./routes/reviewRoutes');
const healthRoutes = require('./routes/healthRoutes');
const storageService = require('./services/storageService');
const logger = require('./utils/logger');

// Initialize the Express application
const app = express();

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Only use morgan in development to avoid double logging
if (config.nodeEnv === 'development') {
  const morgan = require('morgan');
  app.use(morgan('dev', {
    // Skip logging for health check endpoints to reduce noise
    skip: (req) => req.url.startsWith('/health')
  }));
} else {
  // In non-development environments, use our custom logger
  app.use(requestLogger);
}

// Initialize storage directory
fs.ensureDirSync(config.storagePath);
logger.info(`Storage directory ensured at: ${config.storagePath}`);

// Check for Gemini API key
if (!config.gemini.apiKey) {
  logger.error('CRITICAL: No Gemini API key configured! Set GEMINI_API_KEY in your environment.');
} else {
  // Show the first and last 4 characters of the API key for debugging
  const maskedKey = config.gemini.apiKey ? 
    `${config.gemini.apiKey.slice(0, 4)}...${config.gemini.apiKey.slice(-4)}` : 
    'NOT CONFIGURED';
  logger.info(`Gemini API key configured: ${maskedKey}`);
}

// Routes
app.use('/health', healthRoutes);
app.use('/reviews', reviewRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found', message: `Route ${req.method} ${req.url} does not exist` });
});

// Error handling middleware
app.use(errorHandler);

// Schedule cleanup job
cron.schedule('*/30 * * * *', async () => {
  try {
    const cleanedCount = await storageService.cleanupOldReviews();
    logger.info(`Cleaned up ${cleanedCount} old reviews`);
  } catch (error) {
    logger.error('Error during scheduled cleanup:', error);
  }
});

// Start the server
const server = app.listen(config.port, () => {
  logger.info(`=================================================`);
  logger.info(`Server started on port ${config.port} in ${config.nodeEnv} mode`);
  logger.info(`Gemini API key: ${config.gemini.apiKey ? 'CONFIGURED' : 'MISSING'}`);
  logger.info(`Storage path: ${config.storagePath}`);
  logger.info(`=================================================`);
});

setTimeout(async () => {
    try {
      const geminiService = require('./services/geminiService');
      logger.info('Testing Gemini API connection...');
      const result = await geminiService.generateContent('Hello, respond with OK');
      logger.info(`Gemini API test result: ${result}`);
    } catch (error) {
      logger.error('Gemini API test failed:', error);
    }
  }, 2000);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});