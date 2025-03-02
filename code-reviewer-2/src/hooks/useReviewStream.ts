import { useState, useCallback, useRef } from 'react';
import { parseReviewText } from '@/lib/text-parser';
import { CodeReviewResponse } from '@/lib/prompts';
import { ReviewStatus } from '@/lib/review-store';
import { createStorableReview, addReview } from '@/lib/storage-utils';
import { Language } from '@/lib/language-utils';

/**
 * States for the review streaming process
 */
export type ReviewStreamState = 
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'completed'
  | 'repairing'
  | 'error';

/**
 * Review streaming state
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
}

/**
 * Custom hook for managing direct streaming of reviews
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
    language: { id: 'javascript', name: 'JavaScript', extensions: ['js'], setup: () => {} }
  });
  
  // Reference to the current reader to allow cancellation
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  
  /**
   * Starts a new code review with streaming response
   * @param code - The code to review
   * @param language - The programming language
   * @param filename - Optional filename
   */
  const startReview = useCallback(async (
    code: string,
    language: Language,
    filename?: string
  ) => {
    // Cancel any existing stream
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (e) {
        // Ignore cancellation errors
      }
      readerRef.current = null;
    }
    
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
      filename
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
      
      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to start review: ${response.status} - ${errorData?.error || 'Unknown error'}`);
      }
      
      // Set streaming status
      setReviewState(prev => ({
        ...prev,
        status: 'streaming'
      }));
      
      // Set up the event source reader
      const reader = response.body.getReader();
      readerRef.current = reader;
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      // Process the stream
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('[Client] Stream complete');
            break;
          }
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete events in the buffer
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep the last incomplete event in the buffer
          
          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            
            try {
              // Parse the event data
              const jsonData = JSON.parse(event.slice(6));
              
              // Handle different event types
              switch (jsonData.event) {
                case 'metadata':
                  console.log(`[Client] Received metadata for review: ${jsonData.reviewId}`);
                  setReviewState(prev => ({
                    ...prev,
                    reviewId: jsonData.reviewId
                  }));
                  break;
                  
                case 'chunk':
                  console.log(`[Client] Received chunk: ${jsonData.data.length} chars`);
                  
                  setReviewState(prev => {
                    const newRawText = prev.rawText + jsonData.data;
                    const parsedResult = parseReviewText(newRawText);
                    
                    return {
                      ...prev,
                      rawText: newRawText,
                      parsed: parsedResult.success && parsedResult.result ? parsedResult.result : prev.parsed,
                      parseError: parsedResult.error || null
                    };
                  });
                  break;
                  
                case 'complete':
                  console.log('[Client] Received completion event');
                  
                  setReviewState(prev => {
                    // If we have a parse error, mark for repair
                    if (prev.parseError) {
                      console.log('[Client] Parse error detected, needs repair');
                      return { ...prev, status: 'repairing' };
                    }
                    
                    // Otherwise mark as completed and save to local storage
                    console.log('[Client] Review completed successfully');
                    
                    if (prev.reviewId) {
                      const storedReview = createStorableReview(
                        prev.reviewId,
                        prev.parsed,
                        prev.language.id,
                        prev.filename
                      );
                      addReview(storedReview);
                    }
                    
                    return { ...prev, status: 'completed' };
                  });
                  break;
                  
                case 'error':
                  console.error('[Client] Received error event:', jsonData.error);
                  
                  setReviewState(prev => ({ 
                    ...prev, 
                    status: 'error', 
                    error: jsonData.error || 'Unknown error occurred during review'
                  }));
                  break;
              }
            } catch (error) {
              console.error('[Client] Error parsing event data:', error, event);
            }
          }
        }
      } finally {
        readerRef.current = null;
      }
    } catch (error) {
      console.error('[Client] Error during review:', error);
      
      setReviewState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error starting review'
      }));
    }
  }, []);

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
          language: reviewState.language.id
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
          reviewState.reviewId,
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
  
  return {
    reviewState,
    startReview,
    repairParsing,
    updateSuggestion
  };
}