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

/**
 * In-memory store for reviews
 * In a production app, this would be replaced with a database
 */
class ReviewStore {
  private reviews: Map<string, ReviewData>;
  private static instance: ReviewStore | null = null;
  
  /**
   * Time in milliseconds after which reviews are considered stale
   * and can be cleaned up (30 minutes)
   */
  private static CLEANUP_THRESHOLD = 30 * 60 * 1000;

  /**
   * Creates a new ReviewStore
   */
  private constructor() {
    this.reviews = new Map<string, ReviewData>();
    // Set up periodic cleanup to prevent memory leaks
    setInterval(() => this.cleanupStaleReviews(), 5 * 60 * 1000); // Clean every 5 minutes
  }

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
    
    this.reviews.set(reviewId, reviewData);
    return reviewData;
  }

  /**
   * Retrieves a review by ID
   * @param reviewId - The ID of the review to retrieve
   * @returns The review data or undefined if not found
   */
  public getReview(reviewId: string): ReviewData | undefined {
    return this.reviews.get(reviewId);
  }

  /**
   * Appends a chunk to an existing review
   * @param reviewId - The ID of the review
   * @param chunk - The content chunk to append
   * @returns The updated review or undefined if review not found
   */
  public appendChunk(reviewId: string, chunk: string): ReviewData | undefined {
    const review = this.reviews.get(reviewId);
    
    if (review) {
      review.chunks.push(chunk);
      review.lastUpdated = Date.now();
      return review;
    }
    
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
    const review = this.reviews.get(reviewId);
    
    if (review) {
      review.status = status;
      review.lastUpdated = Date.now();
      
      if (error) {
        review.error = error;
      }
      
      return review;
    }
    
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
    const review = this.reviews.get(reviewId);
    
    if (review) {
      review.parsedResponse = parsedResponse;
      review.lastUpdated = Date.now();
      return review;
    }
    
    return undefined;
  }

  /**
   * Removes old reviews to prevent memory leaks
   * Only removes completed or error reviews older than the threshold
   */
  private cleanupStaleReviews(): void {
    const now = Date.now();
    
    for (const [id, review] of this.reviews.entries()) {
      const isFinished = 
        review.status === ReviewStatus.COMPLETED || 
        review.status === ReviewStatus.ERROR;
      
      const isStale = 
        now - review.lastUpdated > ReviewStore.CLEANUP_THRESHOLD;
      
      if (isFinished && isStale) {
        this.reviews.delete(id);
      }
    }
  }
}

/**
 * Gets the singleton instance of the ReviewStore
 * @returns The ReviewStore instance
 */
export function getReviewStore(): ReviewStore {
  return ReviewStore.getInstance();
}