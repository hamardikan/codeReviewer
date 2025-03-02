import { NextRequest, NextResponse } from 'next/server';
import { getReviewStore } from '@/lib/review-store';

export const maxDuration = 60;
/**
 * Response interface for the chunks API
 */
interface ChunksResponse {
  reviewId: string;
  status: string;
  chunks: string[];
  nextChunkId: number;
  isComplete: boolean;
  error?: string;
}

/**
 * GET handler for retrieving chunks of a review
 * @param request - The HTTP request
 * @returns Response with chunks and status
 */
export function GET(request: NextRequest): NextResponse {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const reviewId = url.searchParams.get('id');
    const lastChunkId = parseInt(url.searchParams.get('lastChunk') || '-1');
    
    console.log(`[API] Received chunks request for reviewId: ${reviewId}, lastChunk: ${lastChunkId}`);
    
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
    const review = reviewStore.getReview(reviewId);
    
    if (!review) {
      console.log(`[API] Error: Review not found - ID: ${reviewId}`);
      
      // For debugging: Get all reviews in store
      const allReviews = reviewStore.getAllReviews();
      console.log(`[API] Available reviews: ${allReviews.length}`);
      console.log(`[API] Review IDs: ${allReviews.map(r => r.id).join(', ')}`);
      
      return NextResponse.json(
        { 
          error: 'Review not found',
          message: `No review found with ID: ${reviewId}`,
          reviewId
        },
        { status: 404 }
      );
    }
    
    // Return new chunks since lastChunkId
    const newChunks = review.chunks.slice(lastChunkId + 1);
    
    console.log(`[API] Returning ${newChunks.length} chunks, review status: ${review.status}`);
    
    const response: ChunksResponse = {
      reviewId,
      status: review.status,
      chunks: newChunks,
      nextChunkId: lastChunkId + newChunks.length,
      isComplete: review.status === 'completed' || review.status === 'error',
      error: review.error
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting review chunks:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve review chunks',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}