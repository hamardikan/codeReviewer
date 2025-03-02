import { NextRequest, NextResponse } from 'next/server';
import { getApiClient } from '@/lib/api-client';

export const maxDuration = 60;

/**
 * Request body interface for repair API
 */
interface RepairRequest {
  rawText: string;
  language?: string;
  reviewId?: string;
}

/**
 * POST handler for repairing malformed responses
 * @param request - The HTTP request
 * @returns Response with repaired content
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await request.json() as RepairRequest;
    
    // Validate request
    if (!body.rawText || typeof body.rawText !== 'string') {
      return NextResponse.json(
        { error: 'Raw text is required and must be a string' },
        { status: 400 }
      );
    }
    
    // Call the API server to repair the review
    const apiClient = getApiClient();
    const repairResult = await apiClient.repairReview(
      body.reviewId || '',
      body.rawText,
      body.language || 'javascript'
    );
    
    return NextResponse.json(repairResult);
  } catch (error) {
    console.error('[API] Error repairing response:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}