'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * GET /health
 * Health check endpoint for monitoring services
 */
router.get('/', async (req, res) => {
  try {
    // Check storage directory
    const storageAccessible = await isStorageAccessible();
    
    // Check Gemini API key (just verify it's set)
    const geminiConfigured = !!config.gemini.apiKey;
    
    // Respond with service status
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      checks: {
        storage: {
          status: storageAccessible ? 'UP' : 'DOWN',
          path: config.storagePath
        },
        gemini: {
          status: geminiConfigured ? 'UP' : 'DOWN'
        }
      },
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Check if storage directory is accessible
 */
async function isStorageAccessible() {
  try {
    // Ensure directory exists
    await fs.ensureDir(config.storagePath);
    
    // Try to write a temporary file
    const testPath = `${config.storagePath}/_health_check_${Date.now()}.tmp`;
    await fs.writeFile(testPath, 'health check');
    
    // Clean up
    await fs.remove(testPath);
    
    return true;
  } catch (error) {
    logger.error('Storage health check failed:', error);
    return false;
  }
}

module.exports = router;