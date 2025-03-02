import { NextRequest, NextResponse } from 'next/server';
import { getReviewStore } from '@/lib/review-store';
import { parseReviewText } from '@/lib/text-parser';

export const maxDuration = 30;

/**
 * Response interface for the result API
 */
interface ResultResponse {
  reviewId: string;
  status: string;
  rawText: string;
  parsedResponse?: Record<string, any>;
  parseError?: string;
  error?: string;
  isComplete: boolean;
}

/**
 * GET handler for retrieving the final result of a review
 * @param request - The HTTP request
 * @returns Response with review result
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const reviewId = url.searchParams.get('id');
    
    console.log(`[API] Received result request for reviewId: ${reviewId}`);
    
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
    
    // If we already have a parsed response, return it
    if (review.parsedResponse) {
      console.log(`[API] Returning cached parsed response for review: ${reviewId}`);
      
      const response: ResultResponse = {
        reviewId,
        status: review.status,
        rawText: review.chunks.join(''),
        parsedResponse: review.parsedResponse,
        isComplete: review.status === 'completed' || review.status === 'error',
        error: review.error
      };
      
      return NextResponse.json(response);
    }
    
    // Otherwise, try to parse the raw text
    const rawText = review.chunks.join('');
    const parseResult = parseReviewText(rawText);
    
    // If parsing was successful, update the stored review
    if (parseResult.success && parseResult.result) {
      console.log(`[API] Successfully parsed review: ${reviewId}`);
      
      // Update the stored review with the parsed response
      await reviewStore.updateParsedResponse(reviewId, parseResult.result);
      
      const response: ResultResponse = {
        reviewId,
        status: review.status,
        rawText,
        parsedResponse: parseResult.result,
        isComplete: review.status === 'completed' || review.status === 'error',
        error: review.error
      };
      
      return NextResponse.json(response);
    }
    
    // If parsing failed, return the error
    console.log(`[API] Failed to parse review: ${reviewId}, Error: ${parseResult.error}`);
    
    const response: ResultResponse = {
      reviewId,
      status: review.status,
      rawText,
      parseError: parseResult.error,
      isComplete: review.status === 'completed' || review.status === 'error',
      error: review.error
    };
    
    return NextResponse.json(response);
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