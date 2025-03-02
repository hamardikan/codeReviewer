'use strict';

const { v4: uuid } = require('uuid');
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
    const reviewId = uuid();
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
    
    // Start background processing with setTimeout to ensure it runs in a separate event loop cycle
    // This is crucial for proper asynchronous execution
    setTimeout(() => {
      processReviewInBackground(reviewId, code, language)
        .catch(error => {
          logger.error(`Background processing error for ${reviewId}:`, error);
        });
    }, 0);
    
    logger.info(`Review ${reviewId} created and scheduled for background processing`);
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
    logger.info(`===== STARTING REVIEW ${reviewId} =====`);
    logger.info(`Language: ${language}, Code length: ${code.length} characters`);
    
    // Update status to processing
    await storageService.updateReview(reviewId, { status: ReviewStatus.PROCESSING });
    logger.debug(`Updated review ${reviewId} status to PROCESSING`);
    
    // Create the prompt for the code review
    const prompt = createCodeReviewPrompt(code, language);
    logger.debug(`Created prompt for ${language} code review, prompt length: ${prompt.length}`);
    
    // Start timing the Gemini API call
    const startTime = Date.now();
    logger.info(`Calling Gemini API for review ${reviewId}`);
    
    // Process the response in chunks
    let chunkCount = 0;
    
    for await (const chunk of geminiService.streamResponse(prompt)) {
      await storageService.appendChunk(reviewId, chunk);
      
      chunkCount++;
      if (chunkCount % 10 === 0) {
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        logger.debug(`Review ${reviewId}: Processed ${chunkCount} chunks (${elapsedTime}s elapsed)`);
      }
    }
    
    // Update status to completed
    await storageService.updateReview(reviewId, { status: ReviewStatus.COMPLETED });
    logger.info(`Updated review ${reviewId} status to COMPLETED`);
    
    // Try to parse the complete response
    const review = await storageService.getReview(reviewId);
    if (review) {
      const rawText = review.getRawText();
      logger.debug(`Parsing raw text for review ${reviewId}, length: ${rawText.length}`);
      
      const parseResult = parseReviewText(rawText);
      
      if (parseResult.success && parseResult.result) {
        logger.info(`Successfully parsed response for review ${reviewId}`);
        logger.debug(`Found ${parseResult.result.suggestions.length} suggestions`);
        await storageService.updateReview(reviewId, { parsedResponse: parseResult.result });
      } else {
        logger.warn(`Failed to parse response for review ${reviewId}: ${parseResult.error}`);
      }
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    logger.info(`===== COMPLETED REVIEW ${reviewId} in ${totalTime}s with ${chunkCount} chunks =====`);
  } catch (error) {
    logger.error(`===== ERROR PROCESSING REVIEW ${reviewId} =====`);
    logger.error(`Error details:`, error);
    
    // Update status to error
    await storageService.updateReview(reviewId, {
      status: ReviewStatus.ERROR,
      error: error.message || 'Unknown error'
    });
    logger.info(`Updated review ${reviewId} status to ERROR`);
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
    logger.info(`===== REPAIRING REVIEW ${reviewId} =====`);
    
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
    
    logger.info(`===== REPAIR COMPLETE: ${repaired.success ? 'SUCCESS' : 'FAILED'} =====`);
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
    logger.info(`===== STARTING REPAIR (${language}) =====`);
    logger.debug(`Raw text length to repair: ${rawText.length} characters`);
    
    const prompt = createRepairPrompt(rawText, language);
    logger.debug(`Created repair prompt, length: ${prompt.length}`);
    
    // Request the AI to fix the formatting
    const startTime = Date.now();
    logger.info('Calling Gemini API for repair');
    const formattedText = await geminiService.generateContent(prompt);
    
    const repairTime = Math.round((Date.now() - startTime) / 1000);
    logger.info(`Received repaired text in ${repairTime}s, length: ${formattedText.length}`);
    
    // Parse the reformatted text
    const parseResult = repairWithRegex(formattedText);
    
    if (parseResult.success) {
      logger.info('Successfully parsed repaired response');
      logger.debug(`Found ${parseResult.result.suggestions.length} suggestions in repaired text`);
    } else {
      logger.warn(`Failed to parse repaired response: ${parseResult.error}`);
    }
    
    logger.info(`===== COMPLETED REPAIR (${parseResult.success ? 'SUCCESS' : 'FAILED'}) =====`);
    
    return parseResult;
  } catch (error) {
    logger.error('===== ERROR DURING REPAIR =====');
    logger.error('Error details:', error);
    
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