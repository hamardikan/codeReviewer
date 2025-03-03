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
const MIN_COMPLETION_TIME_MS = 10000; // 10 seconds - minimum time before considering content-based completion
const MIN_CHUNKS_FOR_COMPLETION = 10; // Need at least this many chunks before considering content-based completion
const MAX_POLL_TIME_MS = 180000; // 3 minutes maximum polling time (increased from 2 minutes)

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
  
  // Reference to review start time (for timing-based decisions)
  const reviewStartTimeRef = useRef<number | null>(null);
  
  // Reference to count retry attempts
  const retryCountRef = useRef(0);
  
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
    retryCountRef.current = 0;
    console.log('Polling stopped');
  }, []);
  
  /**
   * Determines if a review is complete based on content analysis
   * @param text - Raw text content to analyze
   * @param chunkCount - Number of chunks received so far
   * @returns Whether the review appears complete
   */
  const isReviewContentComplete = useCallback((text: string, chunkCount: number): boolean => {
    // Don't check for completion if we haven't received enough chunks
    if (chunkCount < MIN_CHUNKS_FOR_COMPLETION) {
      return false;
    }
    
    // Check if enough time has passed since the review started
    if (reviewStartTimeRef.current) {
      const timeSinceStart = Date.now() - reviewStartTimeRef.current;
      if (timeSinceStart < MIN_COMPLETION_TIME_MS) {
        console.log(`Only ${Math.round(timeSinceStart / 1000)}s since review started, not checking content completion yet`);
        return false;
      }
    }
    
    // Look for all three required sections
    const hasSummary = /SUMMARY:|Summary:|summary:/i.test(text);
    const hasSuggestions = /SUGGESTIONS:|Suggestions:|suggestions:/i.test(text);
    const hasCleanCode = /CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:/i.test(text);
    
    // Need all three sections
    if (!hasSummary || !hasSuggestions || !hasCleanCode) {
      console.log(`Missing required sections: Summary: ${hasSummary}, Suggestions: ${hasSuggestions}, CleanCode: ${hasCleanCode}`);
      return false;
    }
    
    // Check that the CLEAN_CODE section appears to be significant
    // It should be the last section, so it should come after SUGGESTIONS
    const cleanCodeMatch = text.match(/(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)([\s\S]*?)$/i);
    if (!cleanCodeMatch || !cleanCodeMatch[1] || cleanCodeMatch[1].length < 500) {
      console.log('Clean code section is missing or too short');
      return false;
    }
    
    // Additional check: ensure balanced braces in clean code
    const cleanCodeContent = cleanCodeMatch[1];
    const openBraces = (cleanCodeContent.match(/{/g) || []).length;
    const closeBraces = (cleanCodeContent.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      console.log(`Unbalanced braces in clean code: ${openBraces} open vs ${closeBraces} close`);
      return false;
    }
    
    // Try parsing the full content
    const parseResult = parseReviewText(text);
    if (parseResult.success && parseResult.result) {
      // If parsing succeeds, that's strong evidence the review is complete
      console.log('Successful parse indicates review completion');
      return true;
    }
    
    // Not yet complete
    return false;
  }, []);
  
  /**
   * Fetches the final result of a review
   * @param reviewId - The ID of the review
   */
  const fetchFinalResult = useCallback(async (reviewId: string) => {
    try {
      console.log(`Fetching final result for review ${reviewId}`);
      const response = await fetch(`/api/review/result?id=${reviewId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get review result: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      const resultData = await response.json();
      console.log('Received final result:', resultData);
      
      // Determine status based on the response
      let status: ReviewStreamState = 'completed';
      
      if (resultData.error) {
        status = 'error';
        console.error('Error in result:', resultData.error);
      } else if (resultData.parseError) {
        status = 'completed'; // Changed from 'repairing' to allow direct repair
        console.warn('Parse error in result:', resultData.parseError);
      }
      
      // Get the parsed response or create a default one
      let parsed: CodeReviewResponse = {
        summary: '',
        suggestions: [],
        cleanCode: ''
      };
      
      if (resultData.parsedResponse) {
        parsed = resultData.parsedResponse;
        console.log('Successfully parsed response:', parsed);
        
        // Verify clean code is not too short compared to raw text
        if (parsed.cleanCode && resultData.rawText && 
            resultData.rawText.length > 2000 && 
            parsed.cleanCode.length < 300) {
          console.warn('Clean code appears suspiciously short compared to raw text');
        }
      } else {
        // Try to parse ourselves if server didn't provide a parsed response
        console.log('Attempting to parse raw text on client side');
        const parseResult = parseReviewText(resultData.rawText || '');
        if (parseResult.success && parseResult.result) {
          parsed = parseResult.result;
          console.log('Client-side parsing succeeded');
        } else if (parseResult.error) {
          console.warn('Client-side parsing failed:', parseResult.error);
        }
      }
      
      setReviewState(prev => {
        // If completed successfully, save to local storage
        if (status === 'completed' && reviewId && parsed.summary && parsed.cleanCode) {
          console.log('Saving completed review to local storage');
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
      
      // Ensure polling is stopped after fetching final result
      stopPolling();
    } catch (error) {
      console.error('Error fetching final result:', error);
      
      // Increment retry count
      retryCountRef.current += 1;
      
      // If we have retries left, try again after a delay
      if (retryCountRef.current <= 3) {
        console.log(`Retry ${retryCountRef.current}/3 for final result fetch...`);
        
        setTimeout(() => {
          fetchFinalResult(reviewId);
        }, 2000 * retryCountRef.current); // Increasing backoff
        
        return;
      }
      
      // Otherwise, update state with error
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error fetching result',
        progress: 100
      }));
      
      // Ensure polling is stopped on error
      stopPolling();
    }
  }, [stopPolling]); 
  
  /**
   * Polls the status of a review
   * @param reviewId - The ID of the review to poll
   */
  const pollReviewStatus = useCallback(async (reviewId: string) => {
    if (!reviewId || !isPollingRef.current) {
      console.log('Polling skipped - inactive or missing reviewId');
      return;
    }
    
    try {
      // Fetch the current status
      console.log(`Polling status for review ${reviewId}`);
      const response = await fetch(`/api/review/status?id=${reviewId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get review status: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      const statusData = await response.json();
      console.log('Received status data:', {
        status: statusData.status, 
        chunks: statusData.chunks?.length || 0,
        isComplete: statusData.isComplete
      });
      
      // CRITICAL SECTION: Check for any completion indicators
      
      // 1. Check explicit server completion flag
      if (statusData.isComplete === true) {
        console.log('Server explicitly set isComplete to true, fetching final result');
        await fetchFinalResult(reviewId);
        stopPolling();
        return;
      }
      
      // 2. Check server status
      const serverStatus = String(statusData.status || '').toLowerCase();
      if (serverStatus === 'completed' || serverStatus === 'error') {
        console.log(`Server status "${serverStatus}" indicates completion, fetching final result`);
        await fetchFinalResult(reviewId);
        stopPolling();
        return;
      }
      
      // 3. Time-based check - stop polling after a reasonable time
      if (reviewStartTimeRef.current) {
        const timeSinceStart = Date.now() - reviewStartTimeRef.current;
        if (timeSinceStart > MAX_POLL_TIME_MS) { // 3 minutes
          console.log('Maximum polling time reached (3 minutes), fetching final result');
          await fetchFinalResult(reviewId);
          stopPolling();
          return;
        }
      }
      
      // 4. Content-based check
      if (statusData.chunks?.length > 0) {
        const rawText = statusData.chunks.join('');
        const chunkCount = statusData.chunks.length;
        
        // Check if the content appears complete based on pattern analysis
        if (isReviewContentComplete(rawText, chunkCount)) {
          console.log('Review appears complete based on content analysis, fetching final result');
          await fetchFinalResult(reviewId);
          stopPolling();
          return;
        }
        
        // Simplified check for substantial clean code
        if (chunkCount >= MIN_CHUNKS_FOR_COMPLETION && 
            rawText.length > 1000) {
            
          // Check for clean code section with substantial content
          const cleanCodeMatch = rawText.match(/CLEAN_CODE:([\s\S]*?)$/i);
          if (cleanCodeMatch && cleanCodeMatch[1] && cleanCodeMatch[1].length > 500) {
            // Additional check: ensure balanced braces in clean code
            const cleanCodeContent = cleanCodeMatch[1];
            const openBraces = (cleanCodeContent.match(/{/g) || []).length;
            const closeBraces = (cleanCodeContent.match(/}/g) || []).length;
            
            if (openBraces <= closeBraces) {
              console.log('Clean code section appears complete with balanced braces, fetching final result');
              await fetchFinalResult(reviewId);
              stopPolling();
              return;
            }
          }
        }
      }
      
      // Continue with status update if not complete
      setReviewState(prev => {
        // Calculate progress based on chunks (approximate)
        const progress = statusData.chunks?.length > 0 ? 
          Math.min(Math.floor((statusData.chunks.length / 50) * 100), 95) : 
          prev.progress || 10;
        
        // Update the raw text with all chunks
        const newRawText = statusData.chunks?.join('') || '';
        
        // Try to parse the results if we have content
        let parsed = prev.parsed;
        let parseError = null;
        
        if (newRawText && newRawText !== prev.rawText) {
          const parsedResult = parseReviewText(newRawText);
          if (parsedResult.success && parsedResult.result) {
            parsed = parsedResult.result;
            console.log('Successfully parsed partial response');
            
            // Check if clean code has sufficient content
            if (parsed.cleanCode && parsed.cleanCode.length > 500) {
              // If we can parse it successfully with substantial clean code,
              // it's likely complete. Stop polling and get the final result.
              setTimeout(() => {
                if (isPollingRef.current) {
                  console.log('Successfully parsed content with substantial clean code indicates completion');
                  fetchFinalResult(reviewId);
                  stopPolling();
                }
              }, 1000);
            }
          } else if (parsedResult.error) {
            parseError = parsedResult.error;
            console.warn('Parse error for partial response:', parsedResult.error);
          }
        }
        
        // Map API status to UI status - explicitly handle all known server statuses
        let uiStatus: ReviewStreamState = prev.status;
        
        switch(serverStatus) {
          case 'completed':
            uiStatus = 'completed';
            break;
          case 'processing':
            uiStatus = 'processing';
            break;
          case 'queued':
            uiStatus = 'loading';
            break;
          case 'error':
            uiStatus = 'error';
            break;
          case 'repairing':
            uiStatus = 'repairing';
            break;
          default:
            // Keep existing status if unknown
            console.warn(`Unknown server status: ${statusData.status}`);
            break;
        }
        
        console.log(`Mapped to UI status: '${uiStatus}'`);

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
      
      // Continue polling with backoff
      pollIntervalRef.current = Math.min(
        pollIntervalRef.current * POLL_BACKOFF_FACTOR, 
        MAX_POLL_INTERVAL
      );
      
      console.log(`Next poll in ${pollIntervalRef.current}ms`);
      
      pollingTimerRef.current = setTimeout(
        () => pollReviewStatus(reviewId), 
        pollIntervalRef.current
      );
    } catch (error) {
      console.error('Error polling review status:', error);
      
      // Increment retry count
      retryCountRef.current += 1;
      
      // If we have retries left, try again after a delay
      if (retryCountRef.current <= 3) {
        console.log(`Retry ${retryCountRef.current}/3 for status poll...`);
        
        pollingTimerRef.current = setTimeout(
          () => pollReviewStatus(reviewId), 
          2000 * retryCountRef.current // Increasing backoff
        );
        
        return;
      }
      
      // Update state with error
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error polling review status'
      }));
      
      stopPolling();
    }
  }, [fetchFinalResult, stopPolling, isReviewContentComplete]);

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
    
    // Reset state and tracking variables
    reviewStartTimeRef.current = Date.now(); // Track when we started
    retryCountRef.current = 0;
    
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
      
      console.log(`Starting first poll in ${pollIntervalRef.current}ms`);
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
   * Force refreshes the current review
   */
  const forceRefreshReview = useCallback(() => {
    if (reviewState.reviewId) {
      console.log(`Force refreshing review ${reviewState.reviewId}`);
      // Stop any ongoing polling
      stopPolling();
      // Set temporary loading state
      setReviewState(prev => ({
        ...prev,
        status: 'processing',
        progress: 80
      }));
      // Fetch the final result
      fetchFinalResult(reviewState.reviewId);
    } else {
      console.warn('Cannot force refresh - no review ID');
    }
  }, [reviewState.reviewId, fetchFinalResult, stopPolling]);

  /**
   * Attempts to repair a malformed response
   */
  const repairParsing = useCallback(async () => {
    if (!reviewState.rawText || !reviewState.reviewId) {
      console.warn('Cannot repair without raw text or review ID');
      return;
    }
    
    try {
      console.log('[Client] Attempting to repair malformed response');
      
      // Stop any ongoing polling
      stopPolling();
      
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
      console.log('Repair response:', data);
      
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
        // Even if repair fails, set status to completed to allow viewing the raw text
        setReviewState(prev => ({
          ...prev,
          status: 'completed',
          parseError: data.error || 'Failed to repair parsing',
        }));
        
        throw new Error(data.error || 'Failed to repair parsing');
      }
    } catch (error) {
      console.error('[Client] Error repairing response:', error);
      
      // Don't set error state, allow viewing partial results
      setReviewState(prev => ({ 
        ...prev, 
        status: 'completed',
        parseError: error instanceof Error ? error.message : 'Unknown error repairing response'
      }));
    }
  }, [reviewState.rawText, reviewState.reviewId, reviewState.language, reviewState.filename, stopPolling]);
  
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
  
  // Check URL parameters for reviewId on mount
  useEffect(() => {
    // Get reviewId from URL if present
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get('reviewId');
    
    if (reviewId && reviewState.status === 'idle') {
      console.log(`Found reviewId in URL: ${reviewId}, fetching status`);
      
      // Set loading state
      setReviewState(prev => ({
        ...prev,
        reviewId,
        status: 'loading',
        progress: 10
      }));
      
      // Start fetching the review
      fetchFinalResult(reviewId);
    }
  }, [fetchFinalResult, reviewState.status]);
  
  return {
    reviewState,
    startReview,
    forceRefreshReview,
    repairParsing,
    updateSuggestion
  };
}