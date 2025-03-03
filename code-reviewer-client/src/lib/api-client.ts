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
    chunks?: string[];
    lastUpdated?: number;
    isComplete?: boolean;
    progress?: number;
    estimatedCompletionTime?: string;
  }
  
  interface CodeSuggestion {
    id: string;
    lineNumber: number;
    originalCode: string;
    suggestedCode: string;
    explanation: string;
    accepted: boolean | null;
  }
  
  interface CodeReviewResponse {
    summary: string;
    suggestions: CodeSuggestion[];
    cleanCode: string;
  }
  
  interface ReviewResult {
    reviewId: string;
    status: string;
    rawText: string;
    parsedResponse?: CodeReviewResponse;
    parseError?: string;
    isComplete?: boolean;
    error?: string;
  }
  
  interface RepairReviewResult {
    success: boolean;
    result?: CodeReviewResponse;
    error?: string;
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
      console.log(`[ApiClient] Starting review, language: ${language}, filename: ${filename || 'unnamed'}, code length: ${code.length}`);
      
      const response = await fetch(`${this.baseUrl}/reviews/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, filename })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(`[ApiClient] Failed to start review: ${response.status}`, error);
        throw new Error(error.message || 'Failed to start review');
      }
      
      const data = await response.json();
      console.log(`[ApiClient] Review started with ID: ${data.reviewId}`);
      return data;
    }
    
    /**
     * Get the status of a review
     */
    async getReviewStatus(reviewId: string): Promise<ReviewStatus> {
      const response = await fetch(`${this.baseUrl}/reviews/status/${reviewId}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(`[ApiClient] Failed to get status for review ${reviewId}: ${response.status}`, error);
        throw new Error(error.message || 'Failed to get review status');
      }
      
      const statusData = await response.json();
      
      // Add calculated isComplete if not provided by server
      if (statusData.status === 'completed' || statusData.status === 'error') {
        statusData.isComplete = true;
      }
      
      return statusData;
    }
    
    /**
     * Get the result of a review
     */
    async getReviewResult(reviewId: string): Promise<ReviewResult> {
      console.log(`[ApiClient] Getting result for review ${reviewId}`);
      const response = await fetch(`${this.baseUrl}/reviews/result/${reviewId}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(`[ApiClient] Failed to get result for review ${reviewId}: ${response.status}`, error);
        throw new Error(error.message || 'Failed to get review result');
      }
      
      const resultData = await response.json();
      
      // Add calculated isComplete if not provided by server
      if (resultData.status === 'completed' || resultData.status === 'error') {
        resultData.isComplete = true;
      }
      
      // Make sure we have a valid parsed response structure to prevent UI errors
      if (!resultData.parsedResponse && resultData.rawText) {
        console.log(`[ApiClient] Adding empty parsed response for ${reviewId}`);
        resultData.parsedResponse = {
          summary: '',
          suggestions: [],
          cleanCode: ''
        };
      }
      
      return resultData;
    }
    
    /**
     * Repair a malformed review response
     */
    async repairReview(reviewId: string, rawText: string, language: string): Promise<RepairReviewResult> {
      console.log(`[ApiClient] Repairing review ${reviewId}, language: ${language}`);
      
      const response = await fetch(`${this.baseUrl}/reviews/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, rawText, language })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(`[ApiClient] Failed to repair review ${reviewId}: ${response.status}`, error);
        throw new Error(error.message || 'Failed to repair review');
      }
      
      const data = await response.json();
      return data;
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