import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient } from '@/lib/gemini-client';
import { repairWithRegex } from '@/lib/text-parser';
import { createRepairPrompt } from '@/lib/prompts';
import { getReviewStore, ReviewStatus } from '@/lib/review-store';

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
 * Attempts to repair a malformed response using the Gemini API
 * @param rawText - The raw text to repair
 * @param language - The programming language
 * @returns The repaired and parsed result
 */
async function repairWithAI(rawText: string, language = 'javascript') {
  try {
    const geminiClient = getGeminiClient();
    const prompt = createRepairPrompt(rawText, language);
    
    // Request the AI to fix the formatting
    const formattedText = await geminiClient.generateContent(prompt);
    
    // Parse the reformatted text
    return repairWithRegex(formattedText);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during AI repair'
    };
  }
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
    
    console.log('[API] Repairing review text of length:', body.rawText.length);
    
    // First try regex-based repair
    let repaired = repairWithRegex(body.rawText);
    
    // If regex fails, use another AI call to structure it
    if (!repaired.success) {
      console.log('[API] Regex repair failed, attempting AI-based repair');
      repaired = await repairWithAI(body.rawText, body.language);
    }
    
    // If we have a review ID, update the review in Redis
    if (repaired.success && body.reviewId && repaired.result) {
      const reviewStore = getReviewStore();
      const review = await reviewStore.getReview(body.reviewId);
      
      if (review) {
        // Update the parsed response and status
        await reviewStore.updateParsedResponse(body.reviewId, repaired.result);
        await reviewStore.updateStatus(body.reviewId, ReviewStatus.COMPLETED);
        
        console.log(`[API] Updated repaired review in Redis: ${body.reviewId}`);
      }
    }
    
    if (repaired.success) {
      console.log('[API] Successfully repaired review text');
    } else {
      console.log('[API] Failed to repair review text:', repaired.error);
    }
    
    return NextResponse.json(repaired);
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