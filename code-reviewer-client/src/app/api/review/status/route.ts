import { NextRequest, NextResponse } from 'next/server';
import { getApiClient } from '@/lib/api-client';

export const maxDuration = 30;

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
    
    // Validate reviewId
    if (!reviewId) {
      return NextResponse.json(
        { error: 'Review ID is required' },
        { status: 400 }
      );
    }
    
    // Call the API server to get the review status
    const apiClient = getApiClient();
    const statusData = await apiClient.getReviewStatus(reviewId);
    
    return NextResponse.json(statusData);
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