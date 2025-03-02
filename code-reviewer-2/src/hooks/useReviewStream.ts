import { useState, useEffect, useCallback } from 'react';
import { parseReviewText } from '@/lib/text-parser';
import { CodeReviewResponse } from '@/lib/prompts';
import { ReviewStatus } from '@/lib/review-store';

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
}

/**
 * Structure of a stored review in localStorage
 */
interface StoredReview {
    id: string;
    timestamp: number;
    parsedResponse: CodeReviewResponse;
    rawText: string;
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
        error: null
    });

    const [pollDelay, setPollDelay] = useState(500);


    /**
     * Saves a completed review to localStorage with size limit safeguards
     * @param reviewId - The ID of the review
     * @param parsedResponse - The parsed review response
     * @param rawText - The raw text from the AI
     */
    const saveReviewToLocalStorage = useCallback((
        reviewId: string,
        parsedResponse: CodeReviewResponse,
        rawText: string
    ) => {
        try {
            // Get existing reviews
            const existingReviewsJson = localStorage.getItem('code-reviews');
            const existingReviews: StoredReview[] = existingReviewsJson
                ? JSON.parse(existingReviewsJson)
                : [];

            // Trim raw text to prevent exceeding storage limits (keep first 5KB)
            const trimmedRawText = rawText.length > 5000
                ? rawText.substring(0, 5000) + '... (truncated)'
                : rawText;

            // Add new review
            const newReview: StoredReview = {
                id: reviewId,
                timestamp: Date.now(),
                parsedResponse,
                rawText: trimmedRawText
            };

            // Update localStorage (keeping only 5 most recent reviews to save space)
            const updatedReviews = [
                newReview,
                ...existingReviews.filter(r => r.id !== reviewId)
            ].slice(0, 5);

            try {
                localStorage.setItem('code-reviews', JSON.stringify(updatedReviews));
            } catch  {
                console.warn('Storage quota exceeded. Reducing history size.');

                // If we hit quota limits, try again with even fewer reviews
                localStorage.setItem('code-reviews', JSON.stringify([newReview]));
            }
        } catch (error) {
            console.error('Error saving review to localStorage:', error);
        }
    }, []);

/**
 * Starts a new code review
 * @param code - The code to review
 * @param language - The programming language
 */
const startReview = useCallback(async (code: string, language = 'javascript') => {
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
      error: null
    });
    
    try {
      // Start the review process
      const response = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
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
                body: JSON.stringify({ rawText: reviewState.rawText })
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

                // Save to localStorage if needed
                saveReviewToLocalStorage(reviewState.reviewId, data.result, reviewState.rawText);
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
    }, [reviewState.rawText, reviewState.parseError, reviewState.reviewId, saveReviewToLocalStorage]);

    /**
     * Updates a suggestion's acceptance status
     * @param suggestionId - The ID of the suggestion
     * @param accepted - Whether the suggestion is accepted
     */
    const updateSuggestion = useCallback((suggestionId: string, accepted: boolean | null) => {
        setReviewState(prev => ({
            ...prev,
            parsed: {
                ...prev.parsed,
                suggestions: prev.parsed.suggestions.map(suggestion =>
                    suggestion.id === suggestionId
                        ? { ...suggestion, accepted }
                        : suggestion
                )
            }
        }));
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
                        const parsed = parseReviewText(newRawText);

                        return {
                            ...prev,
                            rawText: newRawText,
                            parsed: parsed.success && parsed.result ? parsed.result : prev.parsed,
                            parseError: parsed.error || null
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
                                saveReviewToLocalStorage(
                                    reviewState.reviewId,
                                    reviewState.parsed,
                                    reviewState.rawText
                                );
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
        saveReviewToLocalStorage,
        reviewState.parsed,
        reviewState.rawText
    ]);

    return {
        reviewState,
        startReview,
        repairParsing,
        updateSuggestion
    };
}