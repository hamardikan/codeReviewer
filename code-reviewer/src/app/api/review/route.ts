import { NextRequest } from 'next/server';
import { reviewCode } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language, reviewFocus } = body;

    // Validate required fields
    if (!code || !language) {
      return new Response(
        JSON.stringify({ error: 'Code and language are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check code length (prevent excessive token usage)
    if (code.length > 100000) {
      return new Response(
        JSON.stringify({ error: 'Code is too long (max 100,000 characters)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a transform stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Process the code review in a non-blocking way
    (async () => {
      try {
        // Send initial progress update
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'analyzing', 
          progress: 10,
          message: 'Analyzing code structure...'
        })}\n\n`));
        
        // Add some artificial progress updates
        await new Promise(resolve => setTimeout(resolve, 1000));
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'analyzing', 
          progress: 25,
          message: 'Identifying potential issues...'
        })}\n\n`));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'analyzing', 
          progress: 40,
          message: 'Evaluating code quality...'
        })}\n\n`));
        
        // Get the full review
        const review = await reviewCode(code, language, reviewFocus);
        
        // Send more progress updates
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'analyzing', 
          progress: 80,
          message: 'Generating improvement suggestions...'
        })}\n\n`));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'analyzing', 
          progress: 95,
          message: 'Finalizing review...'
        })}\n\n`));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send the final review
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          status: 'completed', 
          progress: 100,
          review
        })}\n\n`));
        
        // Close the stream
        await writer.close();
      } catch (error) {
        // Handle errors during processing
        console.error('Error during review processing:', error);
        
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ 
            status: 'error', 
            message: error instanceof Error ? error.message : 'An error occurred during the code review'
          })}\n\n`));
          await writer.close();
        } catch (closeError) {
          console.error('Error closing stream:', closeError);
        }
      }
    })();

    // Return the streaming response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Error in review API:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to review code' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}