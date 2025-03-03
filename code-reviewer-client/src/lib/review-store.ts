import { CodeReviewResponse } from './prompts';
import { getApiClient } from './api-client';

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
 * Structure of a review status from the API
 */
interface ReviewStatusResponse {
  reviewId: string;
  status: string;
  chunks?: string[];
  timestamp?: number;
  lastUpdated?: number;
  error?: string;
  language?: string;
  filename?: string;
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
 * API-based store for reviews
 */
export class ReviewStore {
  private static instance: ReviewStore | null = null;
  private apiClient = getApiClient();

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
    
    // This is just a local object now - the actual storage is on the API server
    const reviewData: ReviewData = {
      id: reviewId,
      status,
      chunks,
      timestamp: now,
      lastUpdated: now,
      language,
      filename
    };
    
    return reviewData;
  }

  /**
   * Retrieves a review by ID
   * @param reviewId - The ID of the review to retrieve
   * @returns Promise resolving to the review data or null if not found
   */
  public async getReview(reviewId: string): Promise<ReviewData | null> {
    try {
      const statusData = await this.apiClient.getReviewStatus(reviewId) as ReviewStatusResponse;
      
      if (!statusData) {
        console.log(`[ReviewStore] Review not found: ${reviewId}`);
        return null;
      }
      
      // Ensure we're using the proper type
      const reviewData: ReviewData = {
        id: reviewId,
        status: statusData.status as ReviewStatus,
        chunks: statusData.chunks || [],
        timestamp: statusData.timestamp || Date.now(),
        lastUpdated: statusData.lastUpdated || Date.now(),
        error: statusData.error,
        language: statusData.language,
        filename: statusData.filename
      };
      
      return reviewData;
    } catch (error) {
      console.error(`[ReviewStore] Error retrieving review ${reviewId}:`, error);
      return null;
    }
  }

  /**
   * Appends a chunk to an existing review
   * This is handled by the API server now, but we keep the interface for compatibility
   * @param reviewId - The ID of the review
   * @returns Promise resolving to the updated review or null if not found
   */
  public async appendChunk(
    reviewId: string, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    chunk: string
  ): Promise<ReviewData | null> {
    // In the new architecture, chunks are managed by the API server
    return this.getReview(reviewId);
  }

  /**
   * Updates the status of a review
   * @param reviewId - The ID of the review
   * @returns Promise resolving to the updated review or null if review not found
   */
  public async updateStatus(
    reviewId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    status: ReviewStatus,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error?: string
  ): Promise<ReviewData | null> {
    // In the new architecture, status updates are managed by the API server
    return this.getReview(reviewId);
  }

  /**
   * Updates the parsed response for a review
   * @param reviewId - The ID of the review
   * @returns Promise resolving to the updated review or null if review not found
   */
  public async updateParsedResponse(
    reviewId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parsedResponse: CodeReviewResponse
  ): Promise<ReviewData | null> {
    // In the new architecture, parsed responses are managed by the API server
    return this.getReview(reviewId);
  }

  /**
   * No-op in this architecture since cleanup is handled by the API server
   * @returns Promise always resolving to true
   */
  public async deleteReview(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reviewId: string
  ): Promise<boolean> {
    return true;
  }
}

/**
 * Gets the review store instance
 * @returns The ReviewStore instance
 */
export function getReviewStore(): ReviewStore {
  return ReviewStore.getInstance();
}