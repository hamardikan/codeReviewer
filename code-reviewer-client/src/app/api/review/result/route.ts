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
    
    console.log(`[API Route] Fetching result for review: ${reviewId}`);
    
    // Call the API server to get the review result
    const apiClient = getApiClient();
    const resultData = await apiClient.getReviewResult(reviewId);
    
    console.log(`[API Route] Received result from server:`, {
      status: resultData.status,
      hasContent: !!resultData.rawText,
      contentLength: resultData.rawText?.length || 0,
      hasParsedResponse: !!resultData.parsedResponse,
      isComplete: resultData.isComplete,
      hasError: !!resultData.error,
      parseError: resultData.parseError
    });
    
    // Ensure there's always a parsed response object, even if empty
    // This prevents client errors when trying to access missing properties
    if (!resultData.parsedResponse && resultData.rawText) {
      console.log('[API Route] Adding empty parsed response structure');
      resultData.parsedResponse = {
        summary: '',
        suggestions: [],
        cleanCode: ''
      };
    }
    
    // Force completion status if we have content but server didn't mark it as complete
    if (resultData.rawText && resultData.rawText.length > 1000 && 
        (!resultData.isComplete || resultData.status === 'processing')) {
      console.log('[API Route] Content exists but not marked complete, forcing completion');
      resultData.isComplete = true;
      resultData.status = 'completed';
    }
    
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