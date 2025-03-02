'use strict';

const logger = require('../utils/logger');

/**
 * Middleware for logging request information
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log request information
  logger.debug(`${req.method} ${req.url}`);
  
  // Log the response status and time once it's sent
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.url} ${res.statusCode} [${duration}ms]`);
  });
  
  next();
}

module.exports = { requestLogger };