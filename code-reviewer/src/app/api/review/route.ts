import { NextRequest } from 'next/server';
import { enqueueReviewJob, getJobStatus, cancelJob } from '@/lib/queue';
export const runtime = 'edge';

// POST endpoint to submit a new review job
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

    // Enqueue the job and get a job ID
    const jobId = enqueueReviewJob(code, language, reviewFocus);

    // Return the job ID immediately
    return new Response(
      JSON.stringify({ 
        jobId, 
        message: 'Code review job submitted successfully',
        status: 'pending'
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in review API:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to submit code review job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// GET endpoint to check job status
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: 'Job ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const job = getJobStatus(jobId);

  if (!job) {
    return new Response(
      JSON.stringify({ error: 'Job not found', status: 'not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify(job),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// DELETE endpoint to cancel a job
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: 'Job ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const success = cancelJob(jobId);

  if (!success) {
    return new Response(
      JSON.stringify({ error: 'Job not found or already completed' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ message: 'Job cancelled successfully' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}