import { NextRequest } from 'next/server';
import { reviewCode } from '@/lib/gemini';

// Enable Edge Runtime
export const runtime = 'edge';

// Helper function to create a properly formatted SSE response
function createSSEStream() {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to format and send SSE events
  async function sendEvent(event: string, data: any) {
    const formattedData = typeof data === 'string' ? data : JSON.stringify(data);
    await writer.write(
      encoder.encode(`event: ${event}\ndata: ${formattedData}\n\n`)
    );
  }

  return {
    stream: stream.readable,
    async sendEvent(event: string, data: any) {
      await sendEvent(event, data);
    },
    async close() {
      await writer.close();
    }
  };
}

// Handle streaming code review
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
      if (code.length > 100000) {
        await sendEvent('error', { message: 'Code is too long (max 100,000 characters)' });
        await close();
        return;
      }

      // Send initial progress update
      await sendEvent('state', {
        status: 'analyzing',
        progress: 10,
        message: 'Starting code review...'
      });

      // Progress updates to improve user experience
      const progressUpdates = [
        { progress: 25, message: 'Analyzing code structure...', delay: 500 },
        { progress: 40, message: 'Identifying potential issues...', delay: 500 },
        { progress: 60, message: 'Evaluating code quality...', delay: 500 }
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
      await sendEvent('state', {
        status: 'analyzing',
        progress: 70,
        message: 'Processing code review...'
      });

      const result = await reviewCode(code, language, reviewFocus);

      // Final progress update
      await sendEvent('state', {
        status: 'completed',
        progress: 100,
        message: 'Review completed'
      });

      // Send the complete result
      await sendEvent('complete', result);
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
export async function GET(request: NextRequest) {
  return new Response(JSON.stringify({ message: 'Please use POST for code reviews' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}