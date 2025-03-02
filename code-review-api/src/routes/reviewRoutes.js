'use strict';

const express = require('express');
const router = express.Router();
const reviewService = require('../services/reviewService');
const logger = require('../utils/logger');

/**
 * POST /reviews/start
 * Start a new code review
 */
router.post('/start', async (req, res, next) => {
  try {
    const { code, language = 'javascript', filename } = req.body;
    
    // Validate request
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'Code is required and must be a string'
      });
    }
    
    // Start the review
    const reviewId = await reviewService.startReview(code, language, filename);
    
    // Return the review ID
    res.status(201).json({
      reviewId,
      status: 'queued'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reviews/status/:reviewId
 * Get the status of a review
 */
router.get('/status/:reviewId', async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    
    if (!reviewId) {
      return res.status(400).json({
        error: 'Review ID is required'
      });
    }
    
    const status = await reviewService.getReviewStatus(reviewId);
    res.json(status);
  } catch (error) {
    // If review not found, return 404
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Review not found',
        message: error.message
      });
    }
    
    next(error);
  }
});

/**
 * GET /reviews/result/:reviewId
 * Get the complete result of a review
 */
router.get('/result/:reviewId', async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    
    if (!reviewId) {
      return res.status(400).json({
        error: 'Review ID is required'
      });
    }
    
    const result = await reviewService.getReviewResult(reviewId);
    res.json(result);
  } catch (error) {
    // If review not found, return 404
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Review not found',
        message: error.message
      });
    }
    
    next(error);
  }
});

/**
 * POST /reviews/repair
 * Repair a malformed review response
 */
router.post('/repair', async (req, res, next) => {
  try {
    const { reviewId, rawText, language = 'javascript' } = req.body;
    
    // Validate request
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({
        error: 'Raw text is required and must be a string'
      });
    }
    
    const result = await reviewService.repairReview(reviewId, rawText, language);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;