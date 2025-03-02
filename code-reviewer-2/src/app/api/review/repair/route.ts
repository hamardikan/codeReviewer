
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient } from '@/lib/gemini-client';
import { repairWithRegex } from '@/lib/text-parser';
import { createRepairPrompt } from '@/lib/prompts';

/**
 * Request body interface for repair API
 */
interface RepairRequest {
  rawText: string;
}

/**
 * Attempts to repair a malformed response using the Gemini API
 * @param rawText - The raw text to repair
 * @returns The repaired and parsed result
 */
async function repairWithAI(rawText: string) {
  try {
    const geminiClient = getGeminiClient();
    const prompt = createRepairPrompt(rawText);
    
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
    
    // First try regex-based repair
    let repaired = repairWithRegex(body.rawText);
    
    // If regex fails, use another AI call to structure it
    if (!repaired.success) {
      repaired = await repairWithAI(body.rawText);
    }
    
    return NextResponse.json(repaired);
  } catch (error) {
    console.error('Error repairing response:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}