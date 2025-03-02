import { NextRequest, NextResponse } from 'next/server';
import { getReviewStore } from '@/lib/review-store';

export const maxDuration = 60;

/**
 * Response interface for the status API
 */
interface StatusResponse {
  reviewId: string;
  status: string;
  chunks: string[];
  lastUpdated: number;
  isComplete: boolean;
  error?: string;
}

/**
 * GET handler for retrieving the status of a review
 * @param request - The HTTP request
 * @returns Response with review status
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const reviewId = url.searchParams.get('id');
    
    console.log(`[API] Received status request for reviewId: ${reviewId}`);
    
    // Validate reviewId
    if (!reviewId) {
      console.log('[API] Error: Review ID is required');
      return NextResponse.json(
        { error: 'Review ID is required' },
        { status: 400 }
      );
    }
    
    // Get review from store
    const reviewStore = getReviewStore();
    const review = await reviewStore.getReview(reviewId);
    
    if (!review) {
      console.log(`[API] Error: Review not found - ID: ${reviewId}`);
      return NextResponse.json(
        { 
          error: 'Review not found',
          message: `No review found with ID: ${reviewId}`,
          reviewId
        },
        { status: 404 }
      );
    }
    
    console.log(`[API] Returning status for review: ${reviewId}, status: ${review.status}`);
    
    const response: StatusResponse = {
      reviewId,
      status: review.status,
      chunks: review.chunks,
      lastUpdated: review.lastUpdated,
      isComplete: review.status === 'completed' || review.status === 'error',
      error: review.error
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Error getting review status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve review status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}