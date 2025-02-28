import { NextRequest } from 'next/server';
import { reviewCode } from '@/lib/gemini';
import { chunkCode } from '@/lib/chunker';
import { aggregateCodeReviews } from '@/lib/aggregator';

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

// Handle distributed code review with chunking and parallel processing
export async function POST(request: NextRequest) {
  const { stream, sendEvent, close } = createSSEStream();

  // Process the review in the background
  (async () => {
    try {
      const body = await request.json();
      const { code, language, reviewFocus } = body;

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
            
            // Process the chunk
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

        // Perform the actual code review
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

// Handle GET requests too
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  return new Response(JSON.stringify({ message: 'Please use POST for code reviews' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}