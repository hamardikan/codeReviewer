import { NextRequest, NextResponse } from 'next/server';
import { getReviewStore } from '@/lib/review-store';

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
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const reviewId = url.searchParams.get('id');
    const lastChunkId = parseInt(url.searchParams.get('lastChunk') || '-1');
    
    // Validate reviewId
    if (!reviewId) {
      return NextResponse.json(
        { error: 'Review ID is required' },
        { status: 400 }
      );
    }
    
    // Get review from store
    const reviewStore = getReviewStore();
    const review = reviewStore.getReview(reviewId);
    
    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }
    
    // Return new chunks since lastChunkId
    const newChunks = review.chunks.slice(lastChunkId + 1);
    
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
      { error: 'Failed to retrieve review chunks' },
      { status: 500 }
    );
  }
}