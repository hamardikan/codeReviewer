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
          status: geminiConfigured ? 'UP' : 'DOWN',
          keyConfigured: !!config.gemini.apiKey
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
 * GET /health/gemini
 * Test the Gemini API connection
 */
router.get('/gemini', async (req, res) => {
  try {
    const geminiService = require('../services/geminiService');
    logger.info('Testing Gemini API connection...');
    
    const startTime = Date.now();
    const result = await geminiService.generateContent('Hello, respond with a single word: "OK" if you can read this message.');
    const duration = Date.now() - startTime;
    
    const success = result.includes('OK');
    
    if (success) {
      logger.info(`Gemini API test successful (${duration}ms)`);
      res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        apiResponse: result,
        responseTime: `${duration}ms`
      });
    } else {
      logger.warn(`Gemini API test received unexpected response: ${result}`);
      res.status(500).json({
        status: 'WARNING',
        timestamp: new Date().toISOString(),
        message: 'Gemini API connected but returned unexpected response',
        apiResponse: result,
        responseTime: `${duration}ms`
      });
    }
  } catch (error) {
    logger.error('Gemini API test failed:', error);
    res.status(500).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      error: error.message,
      details: error.stack
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