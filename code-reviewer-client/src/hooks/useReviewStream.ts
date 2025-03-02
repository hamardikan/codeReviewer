import { useState, useCallback, useEffect, useRef } from 'react';
import { parseReviewText } from '@/lib/text-parser';
import { CodeReviewResponse } from '@/lib/prompts';
import { createStorableReview, addReview } from '@/lib/storage-utils';
import { Language, getLanguageById } from '@/lib/language-utils';

/**
 * States for the review process
 */
export type ReviewStreamState = 
  | 'idle'
  | 'loading'
  | 'processing'
  | 'streaming'
  | 'completed'
  | 'repairing'
  | 'error';

/**
 * Review state
 */
export interface ReviewState {
  reviewId: string | null;
  status: ReviewStreamState;
  rawText: string;
  parsed: CodeReviewResponse;
  parseError: string | null;
  error: string | null;
  language: Language;
  filename?: string;
  progress?: number; // Progress indicator (0-100)
}

// Polling interval constants
const INITIAL_POLL_INTERVAL = 1000; // 1 second
const MAX_POLL_INTERVAL = 5000; // 5 seconds
const POLL_BACKOFF_FACTOR = 1.5; // Increase interval by 50% each time

/**
 * Custom hook for managing asynchronous code reviews
 * @returns An object with the review state and control functions
 */
export function useReviewStream() {
  const [reviewState, setReviewState] = useState<ReviewState>({
    reviewId: null,
    status: 'idle',
    rawText: '',
    parsed: {
      summary: '',
      suggestions: [],
      cleanCode: ''
    },
    parseError: null,
    error: null,
    language: getLanguageById('javascript')
  });
  
  // Reference to the current polling timer
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Reference to current polling interval
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL);
  
  // Reference to whether polling is active
  const isPollingRef = useRef(false);
  
  /**
   * Stops any active polling
   */
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    isPollingRef.current = false;
    pollIntervalRef.current = INITIAL_POLL_INTERVAL;
  }, []);
  
  /**
   * Fetches the final result of a review
   * @param reviewId - The ID of the review
   */
  const fetchFinalResult = useCallback(async (reviewId: string) => {
    try {
      const response = await fetch(`/api/review/result?id=${reviewId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get review result: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      const resultData = await response.json();
      
      setReviewState(prev => {
        const status = resultData.error ? 'error' : 
                     resultData.parseError ? 'repairing' : 
                     'completed';
        
        // Get the parse result, or keep existing one
        const parsed = resultData.parsedResponse || prev.parsed;
        
        // If completed successfully, save to local storage
        if (status === 'completed' && reviewId) {
          const storedReview = createStorableReview(
            reviewId,
            parsed,
            prev.language.id,
            prev.filename
          );
          addReview(storedReview);
        }
        
        return {
          ...prev,
          status,
          rawText: resultData.rawText || prev.rawText,
          parsed,
          parseError: resultData.parseError || null,
          error: resultData.error || null,
          progress: 100
        };
      });
    } catch (error) {
      console.error('Error fetching final result:', error);
      
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error fetching result',
        progress: 100
      }));
    }
  }, []); 
  
  /**
   * Polls the status of a review
   * @param reviewId - The ID of the review to poll
   */
  const pollReviewStatus = useCallback(async (reviewId: string) => {
    if (!reviewId || !isPollingRef.current) return;
    
    try {
      // Fetch the current status
      const response = await fetch(`/api/review/status?id=${reviewId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get review status: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      const statusData = await response.json();
      
      // Update state based on status
      setReviewState(prev => {
        // Calculate progress based on chunks (approximate)
        const progress = statusData.chunks.length > 0 ? 
          Math.min(Math.floor((statusData.chunks.length / 50) * 100), 95) : 
          prev.progress || 10;
        
        // Update the raw text with all chunks
        const newRawText = statusData.chunks.join('');
        
        // Try to parse the results if we have content
        let parsed = prev.parsed;
        let parseError = null;
        
        if (newRawText && newRawText !== prev.rawText) {
          const parsedResult = parseReviewText(newRawText);
          if (parsedResult.success && parsedResult.result) {
            parsed = parsedResult.result;
          } else if (parsedResult.error) {
            parseError = parsedResult.error;
          }
        }
        
        // Map API status to UI status
        let uiStatus: ReviewStreamState = 'processing';
        if (statusData.status === 'completed') uiStatus = 'completed';
        else if (statusData.status === 'error') uiStatus = 'error';
        
        return {
          ...prev,
          status: uiStatus,
          rawText: newRawText,
          parsed,
          parseError,
          progress,
          error: statusData.error || null
        };
      });
      
      // If the review is complete, fetch the final result
      if (statusData.isComplete) {
        await fetchFinalResult(reviewId);
        stopPolling();
        return;
      }
      
      // Continue polling with backoff
      pollIntervalRef.current = Math.min(
        pollIntervalRef.current * POLL_BACKOFF_FACTOR, 
        MAX_POLL_INTERVAL
      );
      
      pollingTimerRef.current = setTimeout(
        () => pollReviewStatus(reviewId), 
        pollIntervalRef.current
      );
    } catch (error) {
      console.error('Error polling review status:', error);
      
      // Update state with error
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error polling review status'
      }));
      
      stopPolling();
    }
  }, [stopPolling, fetchFinalResult]); 
  
  /**
   * Starts a new code review
   * @param code - The code to review
   * @param language - The programming language
   * @param filename - Optional filename
   */
  const startReview = useCallback(async (
    code: string,
    language: Language,
    filename?: string
  ) => {
    // Stop any existing polling
    stopPolling();
    
    // Reset state
    setReviewState({
      reviewId: null,
      status: 'loading',
      rawText: '',
      parsed: {
        summary: '',
        suggestions: [],
        cleanCode: ''
      },
      parseError: null,
      error: null,
      language,
      filename,
      progress: 0
    });
    
    try {
      console.log(`[Client] Starting review for ${filename || 'unnamed code'}, language: ${language.id}`);
      
      // Create the request
      const response = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code,
          language: language.id,
          filename
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to start review: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      console.log(`[Client] Review started with ID: ${data.reviewId}`);
      
      // Set processing status
      setReviewState(prev => ({
        ...prev,
        reviewId: data.reviewId,
        status: 'processing',
        progress: 5
      }));
      
      // Start polling for updates
      isPollingRef.current = true;
      pollIntervalRef.current = INITIAL_POLL_INTERVAL;
      pollingTimerRef.current = setTimeout(
        () => pollReviewStatus(data.reviewId), 
        pollIntervalRef.current
      );
      
    } catch (error) {
      console.error('[Client] Error starting review:', error);
      
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error starting review'
      }));
    }
  }, [stopPolling, pollReviewStatus]);

  /**
   * Attempts to repair a malformed response
   */
  const repairParsing = useCallback(async () => {
    if (!reviewState.rawText || !reviewState.parseError || !reviewState.reviewId) return;
    
    try {
      console.log('[Client] Attempting to repair malformed response');
      
      setReviewState(prev => ({ 
        ...prev, 
        status: 'repairing' 
      }));
      
      const response = await fetch('/api/review/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rawText: reviewState.rawText,
          language: reviewState.language.id,
          reviewId: reviewState.reviewId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Repair failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[Client] Successfully repaired parsing issues');
        
        setReviewState(prev => ({
          ...prev,
          status: 'completed',
          parsed: data.result,
          parseError: null
        }));
        
        // Save to localStorage
        const storedReview = createStorableReview(
          reviewState.reviewId as string,
          data.result,
          reviewState.language.id,
          reviewState.filename
        );
        addReview(storedReview);
      } else {
        throw new Error(data.error || 'Failed to repair parsing');
      }
    } catch (error) {
      console.error('[Client] Error repairing response:', error);
      
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error repairing response'
      }));
    }
  }, [reviewState.rawText, reviewState.parseError, reviewState.reviewId, reviewState.language, reviewState.filename]);
  
  /**
   * Updates a suggestion's acceptance status
   * @param suggestionId - The ID of the suggestion
   * @param accepted - Whether the suggestion is accepted
   */
  const updateSuggestion = useCallback((suggestionId: string, accepted: boolean | null) => {
    setReviewState(prev => {
      const updatedSuggestions = prev.parsed.suggestions.map(suggestion => 
        suggestion.id === suggestionId
          ? { ...suggestion, accepted }
          : suggestion
      );
      
      const updatedParsed = {
        ...prev.parsed,
        suggestions: updatedSuggestions
      };
      
      // If we have a completed review and a valid ID, update the stored review
      if (prev.status === 'completed' && prev.reviewId) {
        const storedReview = createStorableReview(
          prev.reviewId,
          updatedParsed,
          prev.language.id,
          prev.filename
        );
        addReview(storedReview);
      }
      
      return {
        ...prev,
        parsed: updatedParsed
      };
    });
  }, []);
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);
  
  return {
    reviewState,
    startReview,
    repairParsing,
    updateSuggestion
  };
}