import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient } from '@/lib/gemini-client';
import { createCodeReviewPrompt } from '@/lib/prompts';
import { getReviewStore, ReviewStatus } from '@/lib/review-store';

export const maxDuration = 60;

/**
 * Request body interface for starting a review
 */
interface StartReviewRequest {
  code: string;
  language: string;
  filename?: string;
}

/**
 * Response interface for starting a review
 */
interface StartReviewResponse {
  reviewId: string;
  status: string;
}

/**
 * Background processing for code review
 * This function handles the asynchronous processing of the code review
 * @param reviewId - The ID of the review
 * @param code - The code to review
 * @param language - The programming language
 */
async function processReviewInBackground(
  reviewId: string,
  code: string,
  language: string
): Promise<void> {
  try {
    // Get the review store
    const reviewStore = getReviewStore();
    
    // Update status to processing
    await reviewStore.updateStatus(reviewId, ReviewStatus.PROCESSING);
    
    // Create the Gemini client
    const geminiClient = getGeminiClient();
    
    // Create the prompt for the code review
    const prompt = createCodeReviewPrompt(code, language);
    
    // Process the response in chunks
    let chunkCount = 0;
    
    for await (const chunk of geminiClient.streamResponse(prompt)) {
      // Append each chunk to the review
      await reviewStore.appendChunk(reviewId, chunk);
      
      chunkCount++;
      if (chunkCount % 10 === 0) {
        console.log(`[Background] Processed ${chunkCount} chunks for review ${reviewId}`);
      }
    }
    
    // Update status to completed
    await reviewStore.updateStatus(reviewId, ReviewStatus.COMPLETED);
    
    console.log(`[Background] Completed review ${reviewId} with ${chunkCount} chunks`);
  } catch (error) {
    console.error(`[Background] Error processing review ${reviewId}:`, error);
    
    // Update status to error
    const reviewStore = getReviewStore();
    await reviewStore.updateStatus(
      reviewId, 
      ReviewStatus.ERROR, 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * POST handler for starting a new review
 * @param request - The HTTP request
 * @returns Response with review ID and status
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
    console.log(`[API] Starting review with ID: ${reviewId}, language: ${body.language || 'javascript'}`);
    
    // Initialize the review in Redis
    const reviewStore = getReviewStore();
    await reviewStore.storeReview(
      reviewId,
      ReviewStatus.QUEUED,
      [],
      body.language,
      body.filename
    );
    
    // Start background processing
    // We deliberately don't await this to return quickly
    processReviewInBackground(reviewId, body.code, body.language || 'javascript')
      .catch(err => console.error(`[API] Background processing error for ${reviewId}:`, err));
    
    // Return immediately with the review ID
    const response: StartReviewResponse = {
      reviewId,
      status: ReviewStatus.QUEUED
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Error starting review:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to start review',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}