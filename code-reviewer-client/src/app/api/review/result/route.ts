import { NextRequest, NextResponse } from 'next/server';
import { getApiClient } from '@/lib/api-client';

export const maxDuration = 30;

/**
 * GET handler for retrieving the result of a review
 * @param request - The HTTP request
 * @returns Response with review result
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
    
    // Call the API server to get the review result
    const apiClient = getApiClient();
    const resultData = await apiClient.getReviewResult(reviewId);
    
    return NextResponse.json(resultData);
  } catch (error) {
    console.error('[API] Error getting review result:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve review result',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}