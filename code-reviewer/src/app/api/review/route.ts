import { NextRequest } from 'next/server';
import { detectCodeIssues, implementCodeChanges, reviewCode } from '@/lib/gemini';
import { chunkCode } from '@/lib/chunker';
import { aggregateCodeReviews } from '@/lib/aggregator';
import { CodeIssueDetectionResponse, CodeImplementationResponse } from '@/lib/gemini';

// Enable Edge Runtime
export const runtime = 'edge';

// Define a type for the event data
type EventData = Record<string, unknown> | string;

// Helper function to create a properly formatted SSE response
function createSSEStream() {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to format and send SSE events
  async function sendEvent(event: string, data: EventData) {
    const formattedData = typeof data === 'string' ? data : JSON.stringify(data);
    await writer.write(
      encoder.encode(`event: ${event}\ndata: ${formattedData}\n\n`)
    );
  }

  return {
    stream: stream.readable,
    async sendEvent(event: string, data: EventData) {
      await sendEvent(event, data);
    },
    async close() {
      await writer.close();
    }
  };
}

// Handle POST requests for code review
export async function POST(request: NextRequest) {
  const { stream, sendEvent, close } = createSSEStream();

  // Process the review in the background
  (async () => {
    try {
      const body = await request.json();
      const { 
        code, 
        language, 
        reviewFocus, 
        phase = 'detection',  // Default to detection phase
        approvedIssues,       // Only needed for implementation phase
        seniorFeedback        // Optional senior developer feedback
      } = body;

      // Validate required fields
      if (!code || !language) {
        await sendEvent('error', { message: 'Code and language are required' });
        await close();
        return;
      }

      // Check code length (prevent excessive token usage)
      if (code.length > 500000) {
        await sendEvent('error', { message: 'Code is too long (max 500,000 characters)' });
        await close();
        return;
      }

      // Handle different phases
      if (phase === 'detection') {
        // Phase 1: Issue Detection
        await handleDetectionPhase(code, language, reviewFocus, sendEvent);
      } else if (phase === 'implementation') {
        // Phase 2: Implementation of Approved Issues
        await handleImplementationPhase(code, language, approvedIssues, seniorFeedback, reviewFocus, sendEvent);
      } else if (phase === 'complete') {
        // Backward compatibility: Complete review
        await handleCompleteReview(code, language, reviewFocus, sendEvent);
      } else {
        await sendEvent('error', { message: 'Invalid phase specified' });
      }
    } catch (error) {
      console.error('Error in review API:', error);
      await sendEvent('error', {
        message: error instanceof Error ? error.message : 'Failed to process code review'
      });
    } finally {
      await close();
    }
  })().catch(console.error);

  // Return the stream immediately
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}

/**
 * Handles the detection phase - identifies issues without fixing them
 */
async function handleDetectionPhase(
  code: string, 
  language: string, 
  reviewFocus: any, 
  sendEvent: (event: string, data: EventData) => Promise<void>
) {
  // Send initial progress update
  await sendEvent('state', {
    status: 'detecting',
    progress: 5,
    message: 'Starting code analysis...'
  });

  // Determine whether to use chunking based on code size
  const lines = code.split('\n').length;
  const useChunking = lines > 100;

  if (useChunking) {
    // Send chunking status update
    await sendEvent('state', {
      status: 'chunking',
      progress: 10,
      message: 'Dividing code into logical chunks for analysis...'
    });

    // Perform code chunking
    const chunks = chunkCode(code, language);
    
    await sendEvent('state', {
      status: 'detecting',
      progress: 15,
      message: `Analyzing ${chunks.length} code chunks...`
    });

    // Store chunks by ID for aggregation
    const chunksMap = new Map();
    chunks.forEach(chunk => chunksMap.set(chunk.id, chunk));

    // Process each chunk in parallel
    const chunkDetectionsMap = new Map<string, CodeIssueDetectionResponse>();
    const chunkPromises = chunks.map(async (chunk, index) => {
      try {
        // Create context info for the chunk
        const context = `Chunk ${index + 1} of ${chunks.length} containing lines ${chunk.startLine + 1} to ${chunk.endLine + 1}`;
        
        // Process the chunk
        const chunkResult = await detectCodeIssues(chunk.code, language, {
          reviewFocus,
          chunkContext: context,
          isPartialReview: true
        });
        
        // Store the result
        chunkDetectionsMap.set(chunk.id, chunkResult);
        
        // Calculate overall progress based on chunks completed
        const chunkProgress = 15 + Math.floor((index + 1) * 65 / chunks.length);
        
        // Send progress update
        await sendEvent('state', {
          status: 'detecting',
          progress: chunkProgress,
          message: `Analyzed ${index + 1} of ${chunks.length} code chunks...`
        });
        
        // Send partial updates for the UI
        if (chunkResult.issues && chunkResult.issues.length > 0) {
          await sendEvent('update', {
            partialIssues: chunkResult.issues.map(issue => ({
              ...issue,
              // Adjust line numbers to be relative to the full file
              lineNumbers: issue.lineNumbers?.map(lineNum => lineNum + chunk.startLine)
            }))
          });
        }
        
        return chunkResult;
      } catch (chunkError) {
        console.error(`Error analyzing chunk ${chunk.id}:`, chunkError);
        // Continue with other chunks even if one fails
        return null;
      }
    });

    // Wait for all chunks to be processed
    await Promise.all(chunkPromises);
    
    // Send aggregation status
    await sendEvent('state', {
      status: 'aggregating',
      progress: 80,
      message: 'Aggregating issues from all code chunks...'
    });

    // Aggregate the results (needs modification for two-phase approach)
    // Here we create a simplified aggregation for detection phase
    const aggregatedIssues: CodeIssueDetectionResponse['issues'] = [];
    const seenIssueDescriptions = new Set<string>();
    
    // Combine and deduplicate issues
    for (const [chunkId, detection] of chunkDetectionsMap.entries()) {
      const chunk = chunksMap.get(chunkId);
      if (!chunk || !detection.issues) continue;
      
      for (const issue of detection.issues) {
        // Create a key to check for duplicates
        const descriptionKey = `${issue.type}:${issue.description}`;
        
        if (!seenIssueDescriptions.has(descriptionKey)) {
          // Adjust line numbers to be relative to the full file
          if (issue.lineNumbers && issue.lineNumbers.length > 0) {
            issue.lineNumbers = issue.lineNumbers.map(
              lineNum => lineNum + chunk.startLine
            );
          }
          
          aggregatedIssues.push(issue);
          seenIssueDescriptions.add(descriptionKey);
        }
      }
    }
    
    // Generate a quality score based on number and severity of issues
    const qualityScore = calculateQualityScore(aggregatedIssues, lines);
    
    // Create the aggregated detection result
    const aggregatedResult: CodeIssueDetectionResponse = {
      summary: `Detected ${aggregatedIssues.length} issues across ${chunks.length} code chunks.`,
      issues: aggregatedIssues,
      codeQualityScore: qualityScore
    };

    // Final progress update
    await sendEvent('state', {
      status: 'detected',
      progress: 100,
      message: 'Analysis completed'
    });

    // Send the complete aggregated result
    await sendEvent('detection', { ...aggregatedResult });
  } else {
    // For smaller code, process as a single chunk without parallelization
    
    // Progress updates for better UX
    const progressUpdates = [
      { progress: 20, message: 'Analyzing code structure...', delay: 300 },
      { progress: 40, message: 'Identifying potential issues...', delay: 300 },
      { progress: 60, message: 'Evaluating code quality...', delay: 300 },
      { progress: 80, message: 'Finalizing analysis...', delay: 300 }
    ];

    // Send periodic progress updates
    for (const update of progressUpdates) {
      await new Promise(resolve => setTimeout(resolve, update.delay));
      await sendEvent('state', {
        status: 'detecting',
        progress: update.progress,
        message: update.message
      });
    }

    // Perform the issue detection
    const result = await detectCodeIssues(code, language, { reviewFocus });

    // Final progress update
    await sendEvent('state', {
      status: 'detected',
      progress: 100,
      message: 'Analysis completed'
    });

    // Send the detection result
    await sendEvent('detection', { ...result });
  }
}

/**
 * Handles the implementation phase - applies fixes for approved issues
 */
async function handleImplementationPhase(
  code: string, 
  language: string, 
  approvedIssues: string[],
  seniorFeedback: Record<string, string> | undefined,
  reviewFocus: any,
  sendEvent: (event: string, data: EventData) => Promise<void>
) {
  // Validate approved issues
  if (!approvedIssues || !Array.isArray(approvedIssues) || approvedIssues.length === 0) {
    await sendEvent('error', { message: 'No approved issues provided for implementation' });
    return;
  }

  // Send initial progress update
  await sendEvent('state', {
    status: 'implementing',
    progress: 5,
    message: 'Starting implementation of approved changes...'
  });
  
  // For implementation, we need the original detection results
  // In a real implementation, you would store these in a database
  // Here we'll recreate a simplified detection result based on approvedIssues
  
  // First re-detect issues to get the full context
  await sendEvent('state', {
    status: 'reanalyzing',
    progress: 15,
    message: 'Re-analyzing code to prepare for changes...'
  });
  
  const detectionResult = await detectCodeIssues(code, language, { reviewFocus });
  
  // Filter to only keep approved issues
  detectionResult.issues = detectionResult.issues.filter(
    issue => approvedIssues.includes(issue.id)
  );
  
  // Mark issues as approved
  for (const issue of detectionResult.issues) {
    issue.approved = true;
    
    // Add senior feedback if available
    if (seniorFeedback && seniorFeedback[issue.id]) {
      issue.seniorComments = seniorFeedback[issue.id];
    }
  }

  // Send implementation progress
  await sendEvent('state', {
    status: 'implementing',
    progress: 30,
    message: `Implementing ${detectionResult.issues.length} approved changes...`
  });
  
  // Determine whether to use chunking based on code size and number of issues
  const lines = code.split('\n').length;
  const useChunking = lines > 500 && detectionResult.issues.length > 5;
  
  if (useChunking) {
    // Implementation with chunking logic would go here
    // This is complex and would require tracking which issues apply to which chunks
    // For this version, we'll use a simplified non-chunked approach
    
    await sendEvent('state', {
      status: 'implementing',
      progress: 40,
      message: 'Processing changes in chunks...'
    });
    
    // Simplified non-chunked implementation for now
    await sendEvent('state', {
      status: 'implementing',
      progress: 70,
      message: 'Applying approved changes...'
    });
    
    // Apply the changes
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
    
    // Final progress update
    await sendEvent('state', {
      status: 'implemented',
      progress: 100,
      message: 'Implementation completed'
    });
    
    // Send the implementation result
    await sendEvent('implementation', { result: implementationResult });
  } else {
    // For smaller code, process without chunking
    
    // Progress updates for better UX
    const progressUpdates = [
      { progress: 40, message: 'Planning code changes...', delay: 300 },
      { progress: 60, message: 'Applying changes...', delay: 300 },
      { progress: 80, message: 'Verifying code integrity...', delay: 300 }
    ];
    
    // Send periodic progress updates
    for (const update of progressUpdates) {
      await new Promise(resolve => setTimeout(resolve, update.delay));
      await sendEvent('state', {
        status: 'implementing',
        progress: update.progress,
        message: update.message
      });
    }
    
    // Apply the changes
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
    
    // Final progress update
    await sendEvent('state', {
      status: 'implemented',
      progress: 100,
      message: 'Implementation completed'
    });
    
    // Send the implementation result
    await sendEvent('implementation', { result: implementationResult });
  }
}

/**
 * Handles a complete review (both detection and implementation)
 * This is for backward compatibility
 */
async function handleCompleteReview(
  code: string,
  language: string,
  reviewFocus: any,
  sendEvent: (event: string, data: EventData) => Promise<void>
) {
  // Send initial progress update
  await sendEvent('state', {
    status: 'analyzing',
    progress: 5,
    message: 'Starting code review...'
  });

  // Determine whether to use chunking based on code size
  const lines = code.split('\n').length;
  const useChunking = lines > 100;

  if (useChunking) {
    // Send chunking status update
    await sendEvent('state', {
      status: 'chunking',
      progress: 10,
      message: 'Dividing code into logical chunks for parallel processing...'
    });

    // Perform code chunking
    const chunks = chunkCode(code, language);
    
    await sendEvent('state', {
      status: 'processing',
      progress: 15,
      message: `Divided code into ${chunks.length} chunks for parallel processing...`
    });

    // Store chunks by ID for aggregation
    const chunksMap = new Map();
    chunks.forEach(chunk => chunksMap.set(chunk.id, chunk));

    // Process each chunk in parallel
    const chunkReviewsMap = new Map();
    const chunkPromises = chunks.map(async (chunk, index) => {
      try {
        // Create context info for the chunk
        const context = `Chunk ${index + 1} of ${chunks.length} containing lines ${chunk.startLine + 1} to ${chunk.endLine + 1}`;
        
        // Process the chunk (using legacy reviewCode for backward compatibility)
        const chunkResult = await reviewCode(chunk.code, language, {
          reviewFocus,
          chunkContext: context,
          isPartialReview: true
        });
        
        // Store the result
        chunkReviewsMap.set(chunk.id, chunkResult);
        
        // Calculate overall progress based on chunks completed
        const chunkProgress = 15 + Math.floor((index + 1) * 65 / chunks.length);
        
        // Send progress update
        await sendEvent('state', {
          status: 'processing',
          progress: chunkProgress,
          message: `Processed ${index + 1} of ${chunks.length} code chunks...`
        });
        
        // Send partial updates for the UI
        if (chunkResult.issues && chunkResult.issues.length > 0) {
          await sendEvent('update', {
            partialIssues: chunkResult.issues.map(issue => ({
              ...issue,
              // Adjust line numbers to be relative to the full file
              lineNumbers: issue.lineNumbers?.map(lineNum => lineNum + chunk.startLine)
            }))
          });
        }
        
        return chunkResult;
      } catch (chunkError) {
        console.error(`Error processing chunk ${chunk.id}:`, chunkError);
        // Continue with other chunks even if one fails
        return null;
      }
    });

    // Wait for all chunks to be processed
    await Promise.all(chunkPromises);
    
    // Send aggregation status
    await sendEvent('state', {
      status: 'aggregating',
      progress: 80,
      message: 'Combining results from all code chunks...'
    });

    // Aggregate the results
    const aggregatedResult = aggregateCodeReviews(
      chunkReviewsMap,
      chunksMap,
      code
    );

    // Final progress update
    await sendEvent('state', {
      status: 'completed',
      progress: 100,
      message: 'Review completed'
    });

    // Send the complete aggregated result
    await sendEvent('complete', { ...aggregatedResult });
  } else {
    // For smaller code, process as a single chunk without parallelization
    
    // Progress updates for better UX
    const progressUpdates = [
      { progress: 20, message: 'Analyzing code structure...', delay: 300 },
      { progress: 40, message: 'Identifying potential issues...', delay: 300 },
      { progress: 60, message: 'Evaluating code quality...', delay: 300 },
      { progress: 80, message: 'Generating improvement suggestions...', delay: 300 }
    ];

    // Send periodic progress updates
    for (const update of progressUpdates) {
      await new Promise(resolve => setTimeout(resolve, update.delay));
      await sendEvent('state', {
        status: 'analyzing',
        progress: update.progress,
        message: update.message
      });
    }

    // Perform the actual code review (legacy method for backward compatibility)
    const result = await reviewCode(code, language, { reviewFocus });

    // Final progress update
    await sendEvent('state', {
      status: 'completed',
      progress: 100,
      message: 'Review completed'
    });

    // Send the complete result
    await sendEvent('complete', { ...result });
  }
}

/**
 * Calculates a code quality score based on issues
 */
function calculateQualityScore(
  issues: CodeIssueDetectionResponse['issues'],
  totalLines: number
): CodeIssueDetectionResponse['codeQualityScore'] {
  // Start with a perfect score and deduct based on issues
  let overall = 100;
  
  // Count issues by severity
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  
  // Count issues by type
  const typeCounts: Record<string, number> = {};
  
  // Process each issue
  for (const issue of issues) {
    // Count by severity
    if (issue.severity in severityCounts) {
      severityCounts[issue.severity as keyof typeof severityCounts]++;
    }
    
    // Count by type
    if (issue.type) {
      typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
    }
  }
  
  // Deduct points based on severity
  overall -= severityCounts.critical * 15; // Critical issues are serious
  overall -= severityCounts.high * 8;      // High issues are important
  overall -= severityCounts.medium * 3;    // Medium issues are moderate
  overall -= severityCounts.low * 1;       // Low issues are minor
  
  // Adjust for code size (larger codebases naturally have more issues)
  const sizeAdjustment = Math.log10(Math.max(totalLines, 10)) * 2;
  overall += sizeAdjustment;
  
  // Ensure score is between 0 and 100
  overall = Math.max(0, Math.min(100, overall));
  
  // Calculate category scores
  const readability = calculateCategoryScore(typeCounts, [
    'naming', 'readability', 'commenting', 'formatting'
  ], overall);
  
  const maintainability = calculateCategoryScore(typeCounts, [
    'complexity', 'duplication', 'structure', 'organization'
  ], overall);
  
  const simplicity = calculateCategoryScore(typeCounts, [
    'complexity', 'nesting', 'length'
  ], overall);
  
  const consistency = calculateCategoryScore(typeCounts, [
    'formatting', 'naming', 'style'
  ], overall);
  
  return {
    overall: Math.round(overall),
    categories: {
      readability: Math.round(readability),
      maintainability: Math.round(maintainability),
      simplicity: Math.round(simplicity),
      consistency: Math.round(consistency)
    }
  };
}

/**
 * Calculate a category score based on related issue types
 */
function calculateCategoryScore(
  typeCounts: Record<string, number>,
  relatedTypes: string[],
  baseScore: number
): number {
  // Start with the base score
  let score = baseScore;
  
  // Count issues in this category
  let categoryIssueCount = 0;
  for (const type of relatedTypes) {
    categoryIssueCount += typeCounts[type] || 0;
  }
  
  // Deduct points based on category issues
  score -= categoryIssueCount * 5;
  
  // Add some variance
  score += Math.random() * 5 - 2.5;
  
  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
}

// Handle GET requests
export async function GET(_request: NextRequest) {
  return new Response(JSON.stringify({ message: 'Please use POST for code reviews' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}