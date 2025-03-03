/**
 * Client for communicating with the dedicated API server
 */

// Review related interfaces
interface ReviewStartResponse {
    reviewId: string;
    status: string;
  }
  
  interface ReviewStatus {
    reviewId: string;
    status: string;
    progress?: number;
    estimatedCompletionTime?: string;
  }
  
  interface ReviewComment {
    line: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'suggestion';
    code?: string;
  }
  
  interface ReviewResult {
    reviewId: string;
    status: string;
    summary: string;
    comments: ReviewComment[];
    suggestedFixes?: string;
    completedAt?: string;
  }
  
  interface RepairReviewResult {
    reviewId: string;
    status: string;
    repairedResult: ReviewResult;
  }
  
  export class ApiClient {
    private baseUrl: string;
    
    constructor() {
      // Get API server URL from environment
      this.baseUrl = process.env.NEXT_PUBLIC_API_SERVER_URL || 'http://localhost:3001';
      
      if (!this.baseUrl) {
        console.warn('API_SERVER_URL not defined, using default localhost:3001');
      }
    }
    
    /**
     * Start a new code review
     */
    async startReview(code: string, language: string, filename?: string): Promise<ReviewStartResponse> {
      const response = await fetch(`${this.baseUrl}/reviews/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, filename })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start review');
      }
      
      return response.json();
    }
    
    /**
     * Get the status of a review
     */
    async getReviewStatus(reviewId: string): Promise<ReviewStatus> {
      const response = await fetch(`${this.baseUrl}/reviews/status/${reviewId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get review status');
      }
      
      return response.json();
    }
    
    /**
     * Get the result of a review
     */
    async getReviewResult(reviewId: string): Promise<ReviewResult> {
      const response = await fetch(`${this.baseUrl}/reviews/result/${reviewId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get review result');
      }
      
      return response.json();
    }
    
    /**
     * Repair a malformed review response
     */
    async repairReview(reviewId: string, rawText: string, language: string): Promise<RepairReviewResult> {
      const response = await fetch(`${this.baseUrl}/reviews/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, rawText, language })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to repair review');
      }
      
      return response.json();
    }
  }
  
  /**
   * Get the API client instance
   */
  let apiClientInstance: ApiClient | null = null;
  
  export function getApiClient(): ApiClient {
    if (!apiClientInstance) {
      apiClientInstance = new ApiClient();
    }
    return apiClientInstance;
  }