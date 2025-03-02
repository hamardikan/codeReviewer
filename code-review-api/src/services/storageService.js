'use strict';

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/env');
const { ReviewData } = require('../models/Review');

// In-memory cache for active reviews
const reviewCache = new Map();

// Get the full path for a review file
function getReviewFilePath(reviewId) {
  return path.join(config.storagePath, `${reviewId}.json`);
}

/**
 * Saves a review to both cache and file system
 */
async function saveReview(reviewId, reviewData) {
  try {
    // Ensure the directory exists
    await fs.ensureDir(config.storagePath);
    
    // Set expiration time
    if (!reviewData.expiresAt) {
      const ttlMs = config.reviewTtlMinutes * 60 * 1000;
      reviewData.expiresAt = Date.now() + ttlMs;
    }
    
    // Update cache
    reviewCache.set(reviewId, reviewData);
    
    // Save to file system (atomically)
    const filePath = getReviewFilePath(reviewId);
    const tempPath = `${filePath}.tmp`;
    
    await fs.writeJson(tempPath, reviewData, { spaces: 2 });
    await fs.move(tempPath, filePath, { overwrite: true });
    
    logger.debug(`Saved review ${reviewId} to file system`);
    return true;
  } catch (error) {
    logger.error(`Error saving review ${reviewId}:`, error);
    throw error;
  }
}

/**
 * Retrieves a review from cache or file system
 */
async function getReview(reviewId) {
  try {
    // First check cache
    if (reviewCache.has(reviewId)) {
      return reviewCache.get(reviewId);
    }
    
    // If not in cache, try to load from file system
    const filePath = getReviewFilePath(reviewId);
    if (await fs.pathExists(filePath)) {
      const reviewData = await fs.readJson(filePath);
      
      // Convert to ReviewData instance
      const review = new ReviewData(reviewData);
      
      // Add to cache if not expired
      if (review.expiresAt && review.expiresAt > Date.now()) {
        reviewCache.set(reviewId, review);
      }
      
      return review;
    }
    
    return null;
  } catch (error) {
    logger.error(`Error retrieving review ${reviewId}:`, error);
    return null;
  }
}

/**
 * Updates a review with new data
 */
async function updateReview(reviewId, updateData) {
  try {
    const review = await getReview(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    // Update the review
    review.update(updateData);
    
    // Save the updated review
    await saveReview(reviewId, review);
    
    return review;
  } catch (error) {
    logger.error(`Error updating review ${reviewId}:`, error);
    throw error;
  }
}

/**
 * Appends a chunk to a review
 */
async function appendChunk(reviewId, chunk) {
  try {
    const review = await getReview(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    // Append the chunk
    review.appendChunk(chunk);
    
    // Save the updated review
    await saveReview(reviewId, review);
    
    return review;
  } catch (error) {
    logger.error(`Error appending chunk to review ${reviewId}:`, error);
    throw error;
  }
}

/**
 * Deletes a review from both cache and file system
 */
async function deleteReview(reviewId) {
  try {
    // Remove from cache
    reviewCache.delete(reviewId);
    
    // Remove from file system
    const filePath = getReviewFilePath(reviewId);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      logger.debug(`Deleted review ${reviewId} from file system`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Error deleting review ${reviewId}:`, error);
    return false;
  }
}

/**
 * Cleans up old reviews based on TTL
 */
async function cleanupOldReviews() {
  try {
    // Get all review files
    const files = await fs.readdir(config.storagePath);
    const reviewFiles = files.filter(file => file.endsWith('.json'));
    
    let cleanedCount = 0;
    const now = Date.now();
    
    // Process each file
    for (const file of reviewFiles) {
      try {
        const filePath = path.join(config.storagePath, file);
        const reviewData = await fs.readJson(filePath);
        
        // Check if expired
        if (reviewData.expiresAt && reviewData.expiresAt < now) {
          const reviewId = path.basename(file, '.json');
          
          // Remove from cache and file system
          reviewCache.delete(reviewId);
          await fs.remove(filePath);
          
          cleanedCount++;
        }
      } catch (innerError) {
        logger.error(`Error processing file ${file} during cleanup:`, innerError);
      }
    }
    
    // Also clean up memory for any expired reviews that may not have files
    for (const [reviewId, review] of reviewCache.entries()) {
      if (review.expiresAt && review.expiresAt < now) {
        reviewCache.delete(reviewId);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  } catch (error) {
    logger.error('Error cleaning up old reviews:', error);
    throw error;
  }
}

module.exports = {
  saveReview,
  getReview,
  updateReview,
  appendChunk,
  deleteReview,
  cleanupOldReviews
};