'use strict';

const { nanoid } = require('nanoid');
const geminiService = require('./geminiService');
const storageService = require('./storageService');
const { createCodeReviewPrompt, createRepairPrompt } = require('../utils/prompts');
const { parseReviewText, repairWithRegex } = require('../utils/parser');
const { ReviewData, ReviewStatus } = require('../models/Review');
const logger = require('../utils/logger');

/**
 * Starts a new code review
 * Returns the review ID for subsequent polling
 */
async function startReview(code, language, filename) {
  try {
    // Generate a unique ID for this review
    const reviewId = nanoid();
    logger.info(`Starting review with ID: ${reviewId}, language: ${language}`);
    
    // Create a new review
    const review = new ReviewData({
      id: reviewId,
      status: ReviewStatus.QUEUED,
      language,
      filename
    });
    
    // Save the initial review
    await storageService.saveReview(reviewId, review);
    
    // Start background processing
    // We use a Promise without awaiting to return quickly
    processReviewInBackground(reviewId, code, language).catch(error => {
      logger.error(`Background processing error for ${reviewId}:`, error);
    });
    
    return reviewId;
  } catch (error) {
    logger.error('Error starting review:', error);
    throw error;
  }
}

/**
 * Processes a review in the background
 */
async function processReviewInBackground(reviewId, code, language) {
  try {
    logger.debug(`Starting background processing for review ${reviewId}`);
    
    // Update status to processing
    await storageService.updateReview(reviewId, { status: ReviewStatus.PROCESSING });
    
    // Create the prompt for the code review
    const prompt = createCodeReviewPrompt(code, language);
    
    // Process the response in chunks
    let chunkCount = 0;
    
    for await (const chunk of geminiService.streamResponse(prompt)) {
      await storageService.appendChunk(reviewId, chunk);
      
      chunkCount++;
      if (chunkCount % 10 === 0) {
        logger.debug(`Processed ${chunkCount} chunks for review ${reviewId}`);
      }
    }
    
    // Update status to completed
    await storageService.updateReview(reviewId, { status: ReviewStatus.COMPLETED });
    
    // Try to parse the complete response
    const review = await storageService.getReview(reviewId);
    if (review) {
      const rawText = review.getRawText();
      const parseResult = parseReviewText(rawText);
      
      if (parseResult.success && parseResult.result) {
        await storageService.updateReview(reviewId, { parsedResponse: parseResult.result });
      }
    }
    
    logger.info(`Completed review ${reviewId} with ${chunkCount} chunks`);
  } catch (error) {
    logger.error(`Error processing review ${reviewId}:`, error);
    
    // Update status to error
    await storageService.updateReview(reviewId, {
      status: ReviewStatus.ERROR,
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Gets the current status of a review
 */
async function getReviewStatus(reviewId) {
  try {
    const review = await storageService.getReview(reviewId);
    
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    return {
      reviewId,
      status: review.status,
      chunks: review.chunks,
      lastUpdated: review.lastUpdated,
      isComplete: review.isComplete(),
      error: review.error
    };
  } catch (error) {
    logger.error(`Error getting status for review ${reviewId}:`, error);
    throw error;
  }
}

/**
 * Gets the complete result of a review
 */
async function getReviewResult(reviewId) {
  try {
    const review = await storageService.getReview(reviewId);
    
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    const rawText = review.getRawText();
    
    // If we already have a parsed response, return it
    if (review.parsedResponse) {
      return {
        reviewId,
        status: review.status,
        rawText,
        parsedResponse: review.parsedResponse,
        isComplete: review.isComplete(),
        error: review.error
      };
    }
    
    // Otherwise, try to parse the raw text
    const parseResult = parseReviewText(rawText);
    
    // If parsing was successful, update the stored review
    if (parseResult.success && parseResult.result) {
      await storageService.updateReview(reviewId, { parsedResponse: parseResult.result });
      
      return {
        reviewId,
        status: review.status,
        rawText,
        parsedResponse: parseResult.result,
        isComplete: review.isComplete(),
        error: review.error
      };
    }
    
    // If parsing failed, return the error
    return {
      reviewId,
      status: review.status,
      rawText,
      parseError: parseResult.error,
      isComplete: review.isComplete(),
      error: review.error
    };
  } catch (error) {
    logger.error(`Error getting result for review ${reviewId}:`, error);
    throw error;
  }
}

/**
 * Repairs a malformed review response
 */
async function repairReview(reviewId, rawText, language) {
  try {
    logger.info(`Repairing review ${reviewId}`);
    
    // First try regex-based repair
    let repaired = repairWithRegex(rawText);
    
    // If regex fails, use another AI call to structure it
    if (!repaired.success) {
      logger.debug('Regex repair failed, attempting AI-based repair');
      repaired = await repairWithAI(rawText, language);
    }
    
    // If we have a review ID, update the review
    if (repaired.success && reviewId && repaired.result) {
      const review = await storageService.getReview(reviewId);
      
      if (review) {
        // Update the parsed response and status
        await storageService.updateReview(reviewId, {
          parsedResponse: repaired.result,
          status: ReviewStatus.COMPLETED
        });
        
        logger.info(`Updated repaired review: ${reviewId}`);
      }
    }
    
    return repaired;
  } catch (error) {
    logger.error('Error repairing review:', error);
    throw error;
  }
}

/**
 * Uses the Gemini API to repair a malformed response
 */
async function repairWithAI(rawText, language = 'javascript') {
  try {
    const prompt = createRepairPrompt(rawText, language);
    
    // Request the AI to fix the formatting
    const formattedText = await geminiService.generateContent(prompt);
    
    // Parse the reformatted text
    return repairWithRegex(formattedText);
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error during AI repair'
    };
  }
}

module.exports = {
  startReview,
  getReviewStatus,
  getReviewResult,
  repairReview
};