import { NextRequest, NextResponse } from 'next/server';
import { getApiClient } from '@/lib/api-client';

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
    
    // Call the API server to start the review
    const apiClient = getApiClient();
    const result = await apiClient.startReview(
      body.code,
      body.language || 'javascript',
      body.filename
    );
    
    return NextResponse.json(result);
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