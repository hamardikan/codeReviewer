import { nanoid } from 'nanoid';
import { NextRequest } from 'next/server';
import { getGeminiClient } from '@/lib/gemini-client';
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
 * POST handler for starting a new review with streaming response
 * @param request - The HTTP request
 * @returns Streaming response with review chunks
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    // Parse request body
    const body = await request.json() as StartReviewRequest;
    
    // Validate request
    if (!body.code || typeof body.code !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Code is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Generate a unique ID for this review
    const reviewId = nanoid();
    console.log(`[API] Starting streaming review with ID: ${reviewId}, language: ${body.language || 'javascript'}`);
    
    // Create a new readable stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send the initial metadata with the reviewId
          const metadata = {
            event: 'metadata',
            reviewId,
            timestamp: Date.now()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));
          
          // Create the Gemini client
          const geminiClient = getGeminiClient();
          
          // Create the prompt for the code review
          const prompt = createCodeReviewPrompt(body.code, body.language || 'javascript');
          
          // Stream the response chunks directly to the client
          let chunkCount = 0;
          for await (const chunk of geminiClient.streamResponse(prompt)) {
            // Create a data event with the chunk
            const data = {
              event: 'chunk',
              data: chunk
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            
            chunkCount++;
            if (chunkCount % 10 === 0) {
              console.log(`[API] Streamed ${chunkCount} chunks for review ${reviewId}`);
            }
          }
          
          // Send completion event
          const completion = {
            event: 'complete',
            timestamp: Date.now()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completion)}\n\n`));
          
          console.log(`[API] Completed streaming review ${reviewId} with ${chunkCount} chunks`);
          
          // Close the stream
          controller.close();
        } catch (error) {
          console.error('[API] Error in streaming response:', error);
          
          // Send error event
          const errorEvent = {
            event: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          
          // Close the stream
          controller.close();
        }
      }
    });
    
    // Return the stream as a Server-Sent Events response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('[API] Error starting review:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to start review',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}