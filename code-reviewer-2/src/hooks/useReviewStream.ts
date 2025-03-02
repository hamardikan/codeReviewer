// hooks/useReviewStream.ts
import { useState, useEffect, useCallback } from 'react';
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
 * Custom hook for managing the review streaming process
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

  const [pollDelay, setPollDelay] = useState(500);
  
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
      // Start the review process
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
        throw new Error(`Failed to start review: ${response.status}`);
      }
      
      const { reviewId } = await response.json();
      
      // Update state with review ID
      setReviewState(prev => ({ 
        ...prev, 
        reviewId, 
        status: 'streaming' 
      }));
      
      // Reset polling delay to initial value
      setPollDelay(500);
      
    } catch (error) {
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
  
  // Polling effect for streaming chunks
  useEffect(() => {
    // Only poll if we're in streaming state and have a reviewId
    if (reviewState.status !== 'streaming' || !reviewState.reviewId) {
      return;
    }
    
    let isMounted = true;
    let lastChunkId = -1;
    
    const pollForChunks = async () => {
      if (!isMounted || !reviewState.reviewId) return;
      
      try {
        const response = await fetch(
          `/api/review/chunks?id=${reviewState.reviewId}&lastChunk=${lastChunkId}`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch chunks: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!isMounted) return;
        
        // Process new chunks if any
        if (data.chunks.length > 0) {
          setReviewState(prev => {
            const newRawText = prev.rawText + data.chunks.join('');
            const parsedResult = parseReviewText(newRawText);
            
            return {
              ...prev,
              rawText: newRawText,
              parsed: parsedResult.success && parsedResult.result ? parsedResult.result : prev.parsed,
              parseError: parsedResult.error || null
            };
          });
          
          lastChunkId += data.chunks.length;
        }
        
        // Check if review is complete
        if (data.isComplete) {
          if (data.status === ReviewStatus.ERROR) {
            setReviewState(prev => ({ 
              ...prev, 
              status: 'error', 
              error: data.error || 'Unknown error during review processing'
            }));
          } else {
            // If we have a parse error, try repair
            if (reviewState.parseError) {
              void repairParsing();
            } else {
              setReviewState(prev => ({ 
                ...prev, 
                status: 'completed' 
              }));
              
              // Save to localStorage if parsing was successful
              if (!reviewState.parseError && reviewState.reviewId) {
                const storedReview = createStorableReview(
                  reviewState.reviewId,
                  reviewState.parsed,
                  reviewState.language.id,
                  reviewState.filename
                );
                addReview(storedReview);
              }
            }
          }
        } else {
          // Continue polling with exponential backoff
          const nextDelay = Math.min(pollDelay * 1.5, 5000);
          setPollDelay(nextDelay);
          setTimeout(pollForChunks, nextDelay);
        }
      } catch (error) {
        if (!isMounted) return;
        
        setReviewState(prev => ({ 
          ...prev, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error during polling'
        }));
      }
    };
    
    // Start polling
    void pollForChunks();
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [
    reviewState.status, 
    reviewState.reviewId, 
    pollDelay, 
    repairParsing, 
    reviewState.parseError, 
    reviewState.parsed,
    reviewState.rawText,
    reviewState.language.id,
    reviewState.filename
  ]);
  
  return {
    reviewState,
    startReview,
    repairParsing,
    updateSuggestion
  };
}