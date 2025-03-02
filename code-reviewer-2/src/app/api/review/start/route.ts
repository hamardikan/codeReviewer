import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient } from '@/lib/gemini-client';
import { ReviewStatus, getReviewStore } from '@/lib/review-store';
import { createCodeReviewPrompt } from '@/lib/prompts';

/**
 * Request body interface for starting a review
 */
interface StartReviewRequest {
  code: string;
  language: string;
  filename?: string;
}

/**
 * Response interface for the start review API
 */
interface StartReviewResponse {
  reviewId: string;
}

/**
 * Processes a code review in the background
 * @param reviewId - The ID of the review to process
 * @param code - The code to review
 * @param language - The programming language
 */
async function processReviewInBackground(
  reviewId: string, 
  code: string,
  language: string
): Promise<void> {
  const reviewStore = getReviewStore();
  const geminiClient = getGeminiClient();
  
  try {
    // Create the prompt for the code review with language context
    const prompt = createCodeReviewPrompt(code, language);
    
    // Stream the response from Gemini
    for await (const chunk of geminiClient.streamResponse(prompt)) {
      reviewStore.appendChunk(reviewId, chunk);
    }
    
    // Mark as complete when done
    reviewStore.updateStatus(reviewId, ReviewStatus.COMPLETED);
  } catch (error) {
    console.error('Error processing review:', error);
    
    // Update status to error
    reviewStore.updateStatus(
      reviewId, 
      ReviewStatus.ERROR, 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * POST handler for starting a new review
 * @param request - The HTTP request
 * @returns Response with review ID
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await request.json() as StartReviewRequest;
    
    // Validate request
    if (!body.code || typeof body.code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      );
    }
    
    // Generate a unique ID for this review
    const reviewId = nanoid();
    
    // Store initial state
    const reviewStore = getReviewStore();
    reviewStore.storeReview(reviewId, ReviewStatus.PROCESSING);
    
    // Start processing in background without awaiting completion
    // This allows us to return quickly and avoid timeout issues
    processReviewInBackground(
      reviewId, 
      body.code, 
      body.language || 'javascript'
    ).catch(error => {
      console.error('Unhandled error in background processing:', error);
    });
    
    // Return the review ID to the client
    const response: StartReviewResponse = { reviewId };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error starting review:', error);
    
    return NextResponse.json(
      { error: 'Failed to start review' },
      { status: 500 }
    );
  }
}