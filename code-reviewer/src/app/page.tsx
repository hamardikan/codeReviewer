'use client';

export const maxDuration = 60;
import React, { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import CodeEditor from '@/components/CodeEditor';
import ReviewDisplay from '@/components/ReviewDisplay';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { saveReview, isLocalStorageAvailable } from '@/lib/localStorage';
import { CodeReviewResponse } from '@/lib/gemini';
import Toast, { ToastType } from '@/components/Toast';

interface ReviewFocus {
  cleanCode: boolean;
  performance: boolean;
  security: boolean;
}

interface ReviewProgressState {
  status: 'idle' | 'analyzing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

export default function HomePage() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [reviewResult, setReviewResult] = useState<CodeReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgressState>({
    status: 'idle',
    progress: 0,
  });
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [reviewFocus, setReviewFocus] = useState<ReviewFocus>({
    cleanCode: true,
    performance: false,
    security: false,
  });
  
  // Use a ref to track the abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check if code is empty
  const isCodeEmpty = code.trim() === '';
  const isReviewing = reviewProgress.status === 'analyzing';

  // Helper function to generate progress messages based on percentage
  const getProgressMessage = (progress: number): string => {
    if (progress < 25) return 'Analyzing code structure...';
    if (progress < 50) return 'Identifying potential issues...';
    if (progress < 75) return 'Evaluating code quality...';
    if (progress < 90) return 'Generating improvement suggestions...';
    return 'Finalizing review...';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Handle code review submission
  const handleReviewCode = async () => {
    if (isCodeEmpty) {
      setError('Please enter some code to review.');
      return;
    }

    // Reset previous results and errors
    setReviewResult(null);
    setError(null);
    
    // Cancel any ongoing review
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setReviewProgress({
      status: 'analyzing',
      progress: 5,
      message: 'Starting code review...'
    });

    try {
      // Start the review as a streaming process
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
          reviewFocus,
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Initialize a partial result object
      let partialResult: Partial<CodeReviewResponse> = {
        summary: "",
        issues: [],
        suggestions: [],
        improvedCode: "",
        learningResources: []
      };
      
      let buffer = '';

      // Process the stream chunks
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process any complete events in the buffer
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // The last element might be incomplete
        
        for (const event of events) {
          if (!event.trim()) continue;
          
          // Parse the event
          const eventType = event.match(/^event: (.+)$/m)?.[1];
          const data = event.match(/^data: (.+)$/m)?.[1];
          
          if (eventType && data) {
            try {
              const parsedData = JSON.parse(data);
              
              // Handle different event types
              switch (eventType) {
                case 'state':
                  setReviewProgress({
                    status: parsedData.status === 'completed' ? 'completed' : 'analyzing',
                    progress: parsedData.progress || 0,
                    message: parsedData.message || getProgressMessage(parsedData.progress || 0)
                  });
                  break;
                  
                case 'update':
                  // Update our partial result with the new data
                  partialResult = {
                    ...partialResult,
                    ...parsedData
                  };
                  
                  // If we have enough data to display something meaningful, update the UI
                  if (partialResult.summary && partialResult.issues && partialResult.issues.length > 0) {
                    setReviewResult({
                      summary: partialResult.summary || "",
                      issues: partialResult.issues || [],
                      suggestions: partialResult.suggestions || [],
                      improvedCode: partialResult.improvedCode || code,
                      learningResources: partialResult.learningResources || [],
                      seniorReviewTime: partialResult.seniorReviewTime
                    } as CodeReviewResponse);
                  }
                  break;
                  
                case 'complete':
                  setReviewResult(parsedData);
                  setReviewProgress({
                    status: 'completed',
                    progress: 100
                  });
                  
                  // Save to localStorage
                  if (isLocalStorageAvailable()) {
                    saveReview(code, language, parsedData);
                    window.dispatchEvent(new Event('reviewsUpdated'));
                  }
                  
                  setToast({
                    message: 'Code review completed!',
                    type: 'success'
                  });
                  break;
                  
                case 'error':
                  throw new Error(parsedData.message || 'Unknown error');
                  
                default:
                  console.log(`Unhandled event type: ${eventType}`, parsedData);
              }
            } catch (e) {
              console.error('Error parsing event data:', e);
            }
          }
        }
      }
      
      // Clear the abort controller reference now that we're done
      abortControllerRef.current = null;
      
    } catch (err) {
      // Don't treat aborted requests as errors
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request was cancelled');
        return;
      }
      
      handleReviewError(err);
    }
  };

  // Helper function to handle review errors
  const handleReviewError = (err: unknown) => {
    console.error('Error reviewing code:', err);
    setError(err instanceof Error ? err.message : String(err));
    setReviewProgress({
      status: 'error',
      progress: 0
    });
    
    setToast({
      message: 'Failed to complete code review',
      type: 'error'
    });
    
    // Clear the abort controller
    abortControllerRef.current = null;
  };

  // Handle review focus change
  const handleReviewFocusChange = (focus: keyof ReviewFocus) => {
    setReviewFocus(prev => ({
      ...prev,
      [focus]: !prev[focus]
    }));
  };

  // Cancel ongoing review
  const handleCancelReview = () => {
    // Abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setReviewProgress({
      status: 'idle',
      progress: 0
    });
    
    setToast({
      message: 'Code review cancelled',
      type: 'info'
    });
  };

  // The rest of your component remains largely the same
  return (
    <ThemeProvider>
      <MainLayout>
        {/* Toast notification */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      
        <div className="p-6 max-w-6xl mx-auto">
          {!reviewResult || (reviewProgress.status === 'analyzing') ? (
            <div>
              <h1 className="text-2xl font-bold mb-6">New Code Review</h1>
              
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded dark:bg-red-900 dark:bg-opacity-30 dark:text-red-200 dark:border-red-700">
                  {error}
                </div>
              )}
              
              {/* Progress Indicator */}
              {reviewProgress.status === 'analyzing' && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm font-medium">
                      {reviewProgress.message}
                    </div>
                    <div className="text-sm">
                      {reviewProgress.progress}%
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${reviewProgress.progress}%` }}
                    ></div>
                  </div>
                  
                  {/* Cancel button */}
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleCancelReview}
                      className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Review Focus</h2>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={reviewFocus.cleanCode}
                      onChange={() => handleReviewFocusChange('cleanCode')}
                      className="rounded"
                      disabled={isReviewing}
                    />
                    <span>Clean Code</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={reviewFocus.performance}
                      onChange={() => handleReviewFocusChange('performance')}
                      className="rounded"
                      disabled={isReviewing}
                    />
                    <span>Performance</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={reviewFocus.security}
                      onChange={() => handleReviewFocusChange('security')}
                      className="rounded"
                      disabled={isReviewing}
                    />
                    <span>Security</span>
                  </label>
                </div>
              </div>
              
              <CodeEditor
                code={code}
                language={language}
                onChange={setCode}
                onLanguageChange={setLanguage}
              />
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleReviewCode}
                  disabled={isReviewing || isCodeEmpty}
                  className={`
                    px-6 py-3 rounded-lg font-medium
                    ${isReviewing || isCodeEmpty
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                    }
                  `}
                >
                  {isReviewing ? 'Reviewing...' : 'Review Code'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Code Review Results</h1>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setReviewResult(null);
                      setReviewProgress({
                        status: 'idle',
                        progress: 0
                      });
                    }}
                    className="px-4 py-2 text-sm rounded border hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600"
                  >
                    New Review
                  </button>
                </div>
              </div>
              
              {reviewResult && (
                <ReviewDisplay
                  originalCode={code}
                  review={reviewResult}
                  language={language}
                />
              )}
            </div>
          )}
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}