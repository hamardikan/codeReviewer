'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs-extra');
const cron = require('node-cron');

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
app.use(morgan('dev'));
app.use(requestLogger);

// Initialize storage directory
fs.ensureDirSync(config.storagePath);
logger.info(`Storage directory ensured at: ${config.storagePath}`);

// Routes
app.use('/health', healthRoutes);
app.use('/reviews', reviewRoutes);

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
  logger.info(`Server started on port ${config.port} in ${config.nodeEnv} mode`);
});

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