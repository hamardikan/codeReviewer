'use strict';

const logger = require('../utils/logger');

/**
 * Global error handling middleware
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log the error
  logger.error(`Error [${statusCode}]: ${message}`, { error: err, path: req.path });
  
  // Prepare error response
  const errorResponse = {
    error: true,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  };
  
  res.status(statusCode).json(errorResponse);
}

module.exports = { errorHandler };