import { NextRequest, NextResponse } from 'next/server';
import { reviewCode } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language, reviewFocus } = body;

    // Validate required fields
    if (!code || !language) {
      return NextResponse.json(
        { error: 'Code and language are required' },
        { status: 400 }
      );
    }

    // Check code length (prevent excessive token usage)
    if (code.length > 100000) {
      return NextResponse.json(
        { error: 'Code is too long (max 100,000 characters)' },
        { status: 400 }
      );
    }

    // Get code review from Gemini API
    const review = await reviewCode(code, language, reviewFocus);

    // Return the review
    return NextResponse.json({ review });
  } catch (error: any) {
    console.error('Error in review API:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to review code' },
      { status: 500 }
    );
  }
}