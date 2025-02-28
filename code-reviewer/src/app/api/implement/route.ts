import { NextRequest, NextResponse } from 'next/server';
import { implementCodeChanges, CodeIssueDetectionResponse } from '@/lib/gemini';

// Enable Edge Runtime
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      code, 
      language, 
      reviewFocus,
      approvedIssues,       // IDs of issues approved by senior dev
      approvedIssueData,    // The full issue data for approved issues
      seniorFeedback        // Optional feedback from senior dev
    } = body;

    // Validate required fields
    if (!code || !language || !approvedIssues || !approvedIssueData) {
      return NextResponse.json(
        { message: 'Code, language, approved issues and issue data are required' },
        { status: 400 }
      );
    }

    // Check code length (prevent excessive token usage)
    if (code.length > 500000) {
      return NextResponse.json(
        { message: 'Code is too long (max 500,000 characters)' },
        { status: 400 }
      );
    }

    // Create a detection result with only the approved issues
    const detectionResult: CodeIssueDetectionResponse = {
      summary: `${approvedIssues.length} issues selected for implementation`,
      issues: approvedIssueData,
      // Copy over any other fields that were in the original detection result
      codeQualityScore: body.codeQualityScore
    };
    
    // Add senior feedback to issues if available
    for (const issue of detectionResult.issues) {
      issue.approved = true;
      
      if (seniorFeedback && seniorFeedback[issue.id]) {
        issue.seniorComments = seniorFeedback[issue.id];
      }
    }
    
    // Now implement the approved changes
    const implementationResult = await implementCodeChanges(
      code,
      language,
      detectionResult,
      {
        reviewFocus,
        approvedIssues,
        seniorFeedback
      }
    );

    // Return only what's needed for the implementation phase:
    // 1. The improved code
    // 2. Before/after comparisons for the approved issues
    return NextResponse.json({
      improvedCode: implementationResult.improvedCode,
      // We only need before/after code examples, not re-detecting the issues
      codeChanges: implementationResult.appliedChanges.map(change => ({
        issueId: change.issueId,
        before: change.before,
        after: change.after
      }))
    });

  } catch (error) {
    console.error('Error in implementation API:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to implement changes' },
      { status: 500 }
    );
  }
}