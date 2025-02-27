import { reviewCode, CodeReviewResponse } from './gemini';

export interface ReviewJob {
  id: string;
  code: string;
  language: string;
  reviewFocus?: {
    cleanCode?: boolean;
    performance?: boolean;
    security?: boolean;
  };
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'error';
  progress: number;
  message?: string;
  result?: CodeReviewResponse;
  error?: string;
  createdAt: number;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelToken?: AbortController;
}

// In-memory job store
const jobStore: Map<string, ReviewJob> = new Map();

// Generate a unique job ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Add a new job to the queue and start processing it
 */
export function enqueueReviewJob(
  code: string,
  language: string,
  reviewFocus?: {
    cleanCode?: boolean;
    performance?: boolean;
    security?: boolean;
  }
): string {
  // Create a new job
  const jobId = generateId();
  const jobCancelToken = new AbortController();
  
  const job: ReviewJob = {
    id: jobId,
    code,
    language,
    reviewFocus,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    cancelToken: jobCancelToken
  };

  // Store the job
  jobStore.set(jobId, job);

  // Start processing asynchronously
  processJob(jobId).catch(error => {
    // Only update if the job wasn't cancelled (to avoid race conditions)
    const currentJob = jobStore.get(jobId);
    if (currentJob && currentJob.status !== 'cancelled') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`Error processing job ${jobId}:`, error);
      updateJobStatus(jobId, 'error', { error: errorMessage });
    }
  });

  return jobId;
}

/**
 * Get job status by ID
 */
export function getJobStatus(jobId: string): Omit<ReviewJob, 'cancelToken'> | null {
  const job = jobStore.get(jobId);
  if (!job) return null;
  
  // Create a clean copy without the AbortController
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cancelToken, ...cleanJob } = job;
  return cleanJob;
}

/**
 * Process a job asynchronously
 */
async function processJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    // Update status to processing
    updateJobStatus(jobId, 'processing', { 
      progress: 10,
      message: 'Analyzing code structure...'
    });
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Simulate progress steps (for better UX)
    await artificialProgress(jobId, 25, 'Identifying potential issues...', 500);
    await artificialProgress(jobId, 40, 'Evaluating code quality...', 500);
    
    // Get the job again (it might have been cancelled)
    const currentJob = jobStore.get(jobId);
    if (!currentJob || currentJob.status === 'cancelled') {
      return;
    }
    
    // Perform the actual code review with cancelToken
    const reviewPromise = reviewCode(job.code, job.language, job.reviewFocus);
    
    // Set up cancellation handling
    const abortPromise = new Promise<never>((_, reject) => {
      if (job.cancelToken) {
        job.cancelToken.signal.addEventListener('abort', () => {
          reject(new Error('Job was cancelled'));
        });
      }
    });
    
    // Race between review and cancellation
    const result = await Promise.race([reviewPromise, abortPromise]) as CodeReviewResponse;
    
    // More progress updates
    await artificialProgress(jobId, 80, 'Generating improvement suggestions...', 300);
    await artificialProgress(jobId, 95, 'Finalizing review...', 300);
    
    // Get the job again (it might have been cancelled)
    const finalJob = jobStore.get(jobId);
    if (!finalJob || finalJob.status === 'cancelled') {
      return;
    }
    
    // Update the job with the result
    updateJobStatus(jobId, 'completed', { 
      progress: 100, 
      result 
    });
    
    // Clean up old jobs periodically
    scheduleCleanup();
    
  } catch (error: unknown) {
    const job = jobStore.get(jobId);
    
    // Handle cancellation vs other errors
    if (error instanceof Error && error.message === 'Job was cancelled' || job?.status === 'cancelled') {
      console.log(`Job ${jobId} was cancelled`);
      // Already marked as cancelled, no need to update
    } else {
      console.error(`Error processing job ${jobId}:`, error);
      updateJobStatus(jobId, 'error', { 
        error: error instanceof Error ? error.message : 'An error occurred during processing'
      });
    }
  }
}

/**
 * Helper to create artificial progress updates for better UX
 */
async function artificialProgress(
  jobId: string, 
  progress: number, 
  message: string, 
  delay: number
): Promise<void> {
  // Get the job (it might have been cancelled)
  const job = jobStore.get(jobId);
  if (!job || job.status === 'cancelled') {
    return;
  }
  
  // Update progress
  updateJobStatus(jobId, 'processing', { progress, message });
  
  // Wait with cancellation support
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delay);
    
    // Set up cancellation
    if (job.cancelToken) {
      job.cancelToken.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Job was cancelled'));
      });
    }
  });
}

/**
 * Cancel a job by ID
 * @returns true if the job was cancelled, false if job not found
 */
export function cancelJob(jobId: string): boolean {
  const job = jobStore.get(jobId);
  if (!job) return false;
  
  // Abort any ongoing operations
  job.cancelToken?.abort();
  
  // Update job status
  updateJobStatus(jobId, 'cancelled', { 
    progress: 0,
    message: 'Review cancelled by user'
  });
  
  return true;
}

/**
 * Update job status
 */
function updateJobStatus(
  jobId: string, 
  status: ReviewJob['status'], 
  updates: Partial<ReviewJob>
): void {
  const job = jobStore.get(jobId);
  if (!job) return;
  
  // For cancelled status, don't override with other statuses
  if (job.status === 'cancelled' && status !== 'cancelled') {
    return;
  }
  
  // Update the job
  jobStore.set(jobId, { 
    ...job, 
    status, 
    ...updates 
  });
}

/**
 * Schedule cleanup of old jobs
 */
function scheduleCleanup(): void {
  setTimeout(() => {
    cleanupOldJobs();
  }, 3600000); // Clean up jobs older than 1 hour
}

/**
 * Clean up old jobs to prevent memory leaks
 */
function cleanupOldJobs(): void {
  const oneHourAgo = Date.now() - 3600000;
  
  for (const [jobId, job] of jobStore.entries()) {
    if (job.createdAt < oneHourAgo) {
      // Make sure to abort any pending operations
      job.cancelToken?.abort();
      jobStore.delete(jobId);
    }
  }
}

/**
 * Get all jobs (for debugging purposes)
 */
export function getAllJobs(): Array<Omit<ReviewJob, 'cancelToken'>> {
  return Array.from(jobStore.values()).map(job => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cancelToken, ...cleanJob } = job;
    return cleanJob;
  });
}