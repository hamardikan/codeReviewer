import { NextRequest, NextResponse } from 'next/server';
import { getReviewStore } from '@/lib/review-store';

export const maxDuration = 60;

/**
 * Request body interface for cleanup API
 */
interface CleanupRequest {
  reviewId: string;
}

/**
 * POST handler for cleaning up a review from Redis
 * @param request - The HTTP request
 * @returns Response indicating success or failure
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await request.json() as CleanupRequest;
    
    // Validate reviewId
    if (!body.reviewId) {
      console.log('[API] Error: Review ID is required for cleanup');
      return NextResponse.json(
        { error: 'Review ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`[API] Cleaning up review: ${body.reviewId}`);
    
    // Delete review from store
    const reviewStore = getReviewStore();
    const deleted = await reviewStore.deleteReview(body.reviewId);
    
    if (!deleted) {
      console.log(`[API] Error: Review not found for cleanup - ID: ${body.reviewId}`);
      return NextResponse.json(
        { 
          success: false,
          message: `No review found with ID: ${body.reviewId}`,
        },
        { status: 404 }
      );
    }
    
    console.log(`[API] Successfully cleaned up review: ${body.reviewId}`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully deleted review: ${body.reviewId}`
    });
  } catch (error) {
    console.error('[API] Error cleaning up review:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to clean up review',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}