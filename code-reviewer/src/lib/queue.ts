import { reviewCodeChunk, CodeReviewResponse } from './gemini';
import { chunkCode, CodeChunk } from './chunker';
import { aggregateCodeReviews } from './aggregator';

export interface ReviewJob {
  id: string;
  code: string;
  language: string;
  reviewFocus?: {
    cleanCode?: boolean;
    performance?: boolean;
    security?: boolean;
  };
  status: 'pending' | 'chunking' | 'processing' | 'aggregating' | 'completed' | 'cancelled' | 'error';
  progress: number;
  message?: string;
  result?: CodeReviewResponse;
  error?: string;
  createdAt: number;
  cancelToken?: AbortController;
  
  // New fields for chunked processing
  isParent?: boolean;
  parentId?: string;
  childJobIds?: string[];
  chunks?: Map<string, CodeChunk>;
  chunkReviews?: Map<string, CodeReviewResponse>;
  completedChunks?: number;
  totalChunks?: number;
}

// In-memory job store
const jobStore: Map<string, ReviewJob> = new Map();

// Generate a unique job ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Add a new job to the queue and start processing it with chunking support
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
    cancelToken: jobCancelToken,
    isParent: true,
    childJobIds: [],
    chunks: new Map<string, CodeChunk>(),
    chunkReviews: new Map<string, CodeReviewResponse>(),
    completedChunks: 0,
    totalChunks: 0
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
export function getJobStatus(jobId: string): Omit<ReviewJob, 'cancelToken' | 'chunks' | 'chunkReviews'> | null {
  const job = jobStore.get(jobId);
  if (!job) return null;
  
  // Create a clean copy without the AbortController and internal data
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cancelToken, chunks, chunkReviews, ...cleanJob } = job;
  return cleanJob;
}

/**
 * Process a job asynchronously with chunking support
 */
async function processJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    // Update status to chunking
    updateJobStatus(jobId, 'chunking', { 
      progress: 5,
      message: 'Analyzing code structure for chunking...'
    });
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Check if code is too short for chunking (less than 100 lines)
    const lines = job.code.split('\n').length;
    let chunks: CodeChunk[];
    
    // Determine whether to use chunking based on code size
    if (lines < 100) {
      // For small code, use a single chunk
      chunks = [{
        id: generateId(),
        code: job.code,
        language: job.language,
        startLine: 0,
        endLine: lines - 1
      }];
    } else {
      // For larger code, perform chunking
      chunks = chunkCode(job.code, job.language);
    }
    
    // Store chunks in the job
    job.chunks = new Map();
    for (const chunk of chunks) {
      job.chunks.set(chunk.id, chunk);
    }
    
    job.totalChunks = chunks.length;
    job.completedChunks = 0;
    
    // Update status to processing
    updateJobStatus(jobId, 'processing', { 
      progress: 10,
      message: `Divided code into ${chunks.length} chunks for processing...`
    });
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Create a child job for each chunk
    const childJobPromises: Promise<void>[] = [];
    job.childJobIds = [];
    
    // Process each chunk in parallel
    for (const chunk of chunks) {
      const childJobId = generateId();
      job.childJobIds.push(childJobId);
      
      // Create child job
      const childJob: ReviewJob = {
        id: childJobId,
        code: chunk.code,
        language: job.language,
        reviewFocus: job.reviewFocus,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        cancelToken: job.cancelToken, // Share the cancel token with parent
        parentId: jobId
      };
      
      // Store the child job
      jobStore.set(childJobId, childJob);
      
      // Process the child job
      childJobPromises.push(processChunkJob(childJobId, chunk));
    }
    
    // Wait for all child jobs to complete
    await Promise.all(childJobPromises);
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Check if all child jobs were successful
    const failedChildJobs = job.childJobIds
      .map(id => jobStore.get(id))
      .filter(childJob => childJob && childJob.status === 'error');
    
    if (failedChildJobs.length > 0) {
      // If more than half of chunks failed, consider the job failed
      if (failedChildJobs.length > job.childJobIds.length / 2) {
        throw new Error(`${failedChildJobs.length} out of ${job.childJobIds.length} chunk reviews failed`);
      }
      
      // Otherwise, proceed with the successful chunks
      console.warn(`${failedChildJobs.length} out of ${job.childJobIds.length} chunk reviews failed, proceeding with partial results`);
    }
    
    // Update status to aggregating
    updateJobStatus(jobId, 'aggregating', { 
      progress: 80,
      message: 'Combining chunk reviews into final result...'
    });
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Fetch all chunk reviews
    if (!job.chunkReviews) {
      job.chunkReviews = new Map();
    }
    
    // Aggregate the results from all chunks
    const aggregatedResult = aggregateCodeReviews(
      job.chunkReviews,
      job.chunks,
      job.code
    );
    
    // Update the job with the result
    updateJobStatus(jobId, 'completed', { 
      progress: 100, 
      result: aggregatedResult
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
 * Process a single chunk job
 */
async function processChunkJob(jobId: string, chunk: CodeChunk): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job || !job.parentId) return;
  
  const parentJob = jobStore.get(job.parentId);
  if (!parentJob) return;
  
  try {
    // Update status to processing
    updateJobStatus(jobId, 'processing', { 
      progress: 10,
      message: `Processing chunk ${chunk.id}...`
    });
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Create chunk context for the review
    const chunkContext = `This chunk contains lines ${chunk.startLine}-${chunk.endLine} of the full code`;
    
    // Progress updates for better UX
    await artificialProgress(jobId, 30, 'Analyzing chunk structure...', 300);
    
    // Check if cancelled
    if (job.cancelToken?.signal.aborted) {
      throw new Error('Job was cancelled');
    }
    
    // Perform the actual chunk review
    const result = await reviewCodeChunk(chunk, {
      reviewFocus: job.reviewFocus,
      chunkContext
    });
    
    // Update parent job with the result
    if (parentJob.chunkReviews) {
      parentJob.chunkReviews.set(chunk.id, result);
    }
    
    // Increment completed chunks count
    if (parentJob.completedChunks !== undefined && parentJob.totalChunks !== undefined) {
      parentJob.completedChunks++;
      
      // Update parent progress based on completed chunks
      const completionPercentage = Math.round((parentJob.completedChunks / parentJob.totalChunks) * 70);
      updateJobStatus(job.parentId, 'processing', {
        progress: 10 + completionPercentage,
        message: `Processed ${parentJob.completedChunks} of ${parentJob.totalChunks} chunks...`
      });
    }
    
    // Update the job with the result
    updateJobStatus(jobId, 'completed', { 
      progress: 100, 
      result
    });
    
  } catch (error: unknown) {
    // Handle cancellation vs other errors
    if (error instanceof Error && error.message === 'Job was cancelled' || job.status === 'cancelled') {
      console.log(`Chunk job ${jobId} was cancelled`);
      // Already marked as cancelled, no need to update
    } else {
      console.error(`Error processing chunk job ${jobId}:`, error);
      updateJobStatus(jobId, 'error', { 
        error: error instanceof Error ? error.message : 'An error occurred during chunk processing'
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
  
  // If this is a parent job, cancel all child jobs
  if (job.isParent && job.childJobIds) {
    for (const childId of job.childJobIds) {
      const childJob = jobStore.get(childId);
      if (childJob && childJob.status !== 'cancelled') {
        updateJobStatus(childId, 'cancelled', {
          progress: 0,
          message: 'Parent job was cancelled'
        });
      }
    }
  }
  
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
export function getAllJobs(): Array<Omit<ReviewJob, 'cancelToken' | 'chunks' | 'chunkReviews'>> {
  return Array.from(jobStore.values()).map(job => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cancelToken, chunks, chunkReviews, ...cleanJob } = job;
    return cleanJob;
  });
}