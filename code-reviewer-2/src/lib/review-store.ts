import { CodeReviewResponse } from './prompts';

/**
 * Possible statuses for a review
 */
export enum ReviewStatus {
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
}

// Object to hold reviews for the current session
// This will only persist for the duration of the server process
const sessionReviews: Record<string, ReviewData> = {};

/**
 * In-memory store for reviews
 * This version is designed specifically for serverless environments
 */
class ReviewStore {
  private static instance: ReviewStore | null = null;

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
   * Stores a new review or updates an existing one
   * @param reviewId - The ID of the review
   * @param status - The review status
   * @param chunks - Optional array of content chunks
   * @returns The stored review data
   */
  public storeReview(
    reviewId: string,
    status: ReviewStatus,
    chunks: string[] = []
  ): ReviewData {
    const now = Date.now();
    
    const reviewData: ReviewData = {
      id: reviewId,
      status,
      chunks,
      timestamp: now,
      lastUpdated: now
    };
    
    // Store the review in our session store
    sessionReviews[reviewId] = reviewData;
    
    const reviewCount = Object.keys(sessionReviews).length;
    console.log(`[ReviewStore] Stored review: ${reviewId}, Status: ${status}, Store size: ${reviewCount}`);
    
    return reviewData;
  }

  /**
   * Retrieves a review by ID
   * @param reviewId - The ID of the review to retrieve
   * @returns The review data or undefined if not found
   */
  public getReview(reviewId: string): ReviewData | undefined {
    const review = sessionReviews[reviewId];
    
    if (!review) {
      const reviewCount = Object.keys(sessionReviews).length;
      console.log(`[ReviewStore] Review not found: ${reviewId}, Store size: ${reviewCount}`);
    }
    
    return review;
  }

  /**
   * Returns all reviews in the store (for debugging purposes)
   */
  public getAllReviews(): ReviewData[] {
    return Object.values(sessionReviews);
  }

  /**
   * Lists the IDs of all reviews in the store
   */
  public getAllReviewIds(): string[] {
    return Object.keys(sessionReviews);
  }

  /**
   * Appends a chunk to an existing review
   * @param reviewId - The ID of the review
   * @param chunk - The content chunk to append
   * @returns The updated review or undefined if review not found
   */
  public appendChunk(reviewId: string, chunk: string): ReviewData | undefined {
    const review = sessionReviews[reviewId];
    
    if (review) {
      review.chunks.push(chunk);
      review.lastUpdated = Date.now();
      return review;
    }
    
    console.log(`[ReviewStore] Cannot append chunk - review not found: ${reviewId}`);
    return undefined;
  }

  /**
   * Updates the status of a review
   * @param reviewId - The ID of the review
   * @param status - The new status
   * @param error - Optional error message if status is ERROR
   * @returns The updated review or undefined if review not found
   */
  public updateStatus(
    reviewId: string,
    status: ReviewStatus,
    error?: string
  ): ReviewData | undefined {
    const review = sessionReviews[reviewId];
    
    if (review) {
      review.status = status;
      review.lastUpdated = Date.now();
      
      if (error) {
        review.error = error;
      }
      
      return review;
    }
    
    console.log(`[ReviewStore] Cannot update status - review not found: ${reviewId}`);
    return undefined;
  }

  /**
   * Updates the parsed response for a review
   * @param reviewId - The ID of the review
   * @param parsedResponse - The parsed code review response
   * @returns The updated review or undefined if review not found
   */
  public updateParsedResponse(
    reviewId: string,
    parsedResponse: CodeReviewResponse
  ): ReviewData | undefined {
    const review = sessionReviews[reviewId];
    
    if (review) {
      review.parsedResponse = parsedResponse;
      review.lastUpdated = Date.now();
      return review;
    }
    
    console.log(`[ReviewStore] Cannot update parsed response - review not found: ${reviewId}`);
    return undefined;
  }

  /**
   * Deletes a review by ID
   * @param reviewId - The ID of the review to delete
   * @returns True if successful, false if review not found
   */
  public deleteReview(reviewId: string): boolean {
    if (sessionReviews[reviewId]) {
      delete sessionReviews[reviewId];
      console.log(`[ReviewStore] Deleted review: ${reviewId}`);
      return true;
    }
    
    console.log(`[ReviewStore] Cannot delete - review not found: ${reviewId}`);
    return false;
  }
}

/**
 * Gets the review store instance
 * @returns The ReviewStore instance
 */
export function getReviewStore(): ReviewStore {
  return ReviewStore.getInstance();
}