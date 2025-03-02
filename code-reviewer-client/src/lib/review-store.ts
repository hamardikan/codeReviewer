import { CodeReviewResponse } from './prompts';
import { getRedisClient } from './redis-client';

/**
 * Default TTL for Redis keys in seconds (5 minutes)
 */
const DEFAULT_TTL = 300;

/**
 * Possible statuses for a review
 */
export enum ReviewStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
  REPAIRING = 'repairing'
}

/**
 * Structure of a review in the store
 */
export interface ReviewData {
  id: string;
  status: ReviewStatus;
  chunks: string[];
  error?: string;
  timestamp: number;
  lastUpdated: number;
  parsedResponse?: CodeReviewResponse;
  language?: string;
  filename?: string;
}

/**
 * Redis-based store for reviews
 */
export class ReviewStore {
  private static instance: ReviewStore | null = null;
  private keyPrefix = 'review:';

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Gets the singleton instance of ReviewStore
   * @returns The ReviewStore instance
   */
  public static getInstance(): ReviewStore {
    if (!ReviewStore.instance) {
      ReviewStore.instance = new ReviewStore();
    }
    return ReviewStore.instance;
  }

  /**
   * Generate Redis key for a review
   * @param reviewId - The ID of the review
   * @returns The Redis key
   */
  private getKey(reviewId: string): string {
    return `${this.keyPrefix}${reviewId}`;
  }

  /**
   * Stores a new review or updates an existing one
   * @param reviewId - The ID of the review
   * @param status - The review status
   * @param chunks - Optional array of content chunks
   * @param language - Optional language identifier
   * @param filename - Optional filename
   * @returns Promise resolving to the stored review data
   */
  public async storeReview(
    reviewId: string,
    status: ReviewStatus,
    chunks: string[] = [],
    language?: string,
    filename?: string
  ): Promise<ReviewData> {
    const now = Date.now();
    
    const reviewData: ReviewData = {
      id: reviewId,
      status,
      chunks,
      timestamp: now,
      lastUpdated: now,
      language,
      filename
    };
    
    try {
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      // Store the review in Redis with TTL
      await redis.set(key, JSON.stringify(reviewData), { EX: DEFAULT_TTL });
      
      console.log(`[ReviewStore] Stored review: ${reviewId}, Status: ${status}`);
      
      return reviewData;
    } catch (error) {
      console.error(`[ReviewStore] Error storing review ${reviewId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves a review by ID
   * @param reviewId - The ID of the review to retrieve
   * @returns Promise resolving to the review data or null if not found
   */
  public async getReview(reviewId: string): Promise<ReviewData | null> {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      const data = await redis.get(key);
      
      if (!data) {
        console.log(`[ReviewStore] Review not found: ${reviewId}`);
        return null;
      }
      
      // Reset TTL when fetching
      await redis.expire(key, DEFAULT_TTL);
      
      return JSON.parse(data) as ReviewData;
    } catch (error) {
      console.error(`[ReviewStore] Error retrieving review ${reviewId}:`, error);
      throw error;
    }
  }

  /**
   * Appends a chunk to an existing review
   * @param reviewId - The ID of the review
   * @param chunk - The content chunk to append
   * @returns Promise resolving to the updated review or null if review not found
   */
  public async appendChunk(reviewId: string, chunk: string): Promise<ReviewData | null> {
    try {
      const review = await this.getReview(reviewId);
      
      if (!review) {
        console.log(`[ReviewStore] Cannot append chunk - review not found: ${reviewId}`);
        return null;
      }
      
      review.chunks.push(chunk);
      review.lastUpdated = Date.now();
      
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      await redis.set(key, JSON.stringify(review), { EX: DEFAULT_TTL });
      
      return review;
    } catch (error) {
      console.error(`[ReviewStore] Error appending chunk to review ${reviewId}:`, error);
      throw error;
    }
  }

  /**
   * Updates the status of a review
   * @param reviewId - The ID of the review
   * @param status - The new status
   * @param error - Optional error message if status is ERROR
   * @returns Promise resolving to the updated review or null if review not found
   */
  public async updateStatus(
    reviewId: string,
    status: ReviewStatus,
    error?: string
  ): Promise<ReviewData | null> {
    try {
      const review = await this.getReview(reviewId);
      
      if (!review) {
        console.log(`[ReviewStore] Cannot update status - review not found: ${reviewId}`);
        return null;
      }
      
      review.status = status;
      review.lastUpdated = Date.now();
      
      if (error) {
        review.error = error;
      }
      
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      await redis.set(key, JSON.stringify(review), { EX: DEFAULT_TTL });
      
      return review;
    } catch (error) {
      console.error(`[ReviewStore] Error updating status of review ${reviewId}:`, error);
      throw error;
    }
  }

  /**
   * Updates the parsed response for a review
   * @param reviewId - The ID of the review
   * @param parsedResponse - The parsed code review response
   * @returns Promise resolving to the updated review or null if review not found
   */
  public async updateParsedResponse(
    reviewId: string,
    parsedResponse: CodeReviewResponse
  ): Promise<ReviewData | null> {
    try {
      const review = await this.getReview(reviewId);
      
      if (!review) {
        console.log(`[ReviewStore] Cannot update parsed response - review not found: ${reviewId}`);
        return null;
      }
      
      review.parsedResponse = parsedResponse;
      review.lastUpdated = Date.now();
      
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      await redis.set(key, JSON.stringify(review), { EX: DEFAULT_TTL });
      
      return review;
    } catch (error) {
      console.error(`[ReviewStore] Error updating parsed response of review ${reviewId}:`, error);
      throw error;
    }
  }

  /**
   * Deletes a review by ID
   * @param reviewId - The ID of the review to delete
   * @returns Promise resolving to true if successful, false if review not found
   */
  public async deleteReview(reviewId: string): Promise<boolean> {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(reviewId);
      
      const result = await redis.del(key);
      
      if (result === 0) {
        console.log(`[ReviewStore] Cannot delete - review not found: ${reviewId}`);
        return false;
      }
      
      console.log(`[ReviewStore] Deleted review: ${reviewId}`);
      return true;
    } catch (error) {
      console.error(`[ReviewStore] Error deleting review ${reviewId}:`, error);
      throw error;
    }
  }
}

/**
 * Gets the review store instance
 * @returns The ReviewStore instance
 */
export function getReviewStore(): ReviewStore {
  return ReviewStore.getInstance();
}