'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  
  // Reference to store the EventSource
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Cleanup function for the EventSource
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
  
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

  // Handle code review submission - SIMPLIFIED APPROACH
  const handleReviewCode = async () => {
    if (isCodeEmpty) {
      setError('Please enter some code to review.');
      return;
    }

    // Reset previous results and errors
    setReviewResult(null);
    setError(null);
    setReviewProgress({
      status: 'analyzing',
      progress: 5,
      message: 'Initializing code review...'
    });

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Use a simpler, more direct approach
    try {
      // Send the POST request directly
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
      });
      
      // Check if it's a non-streaming response
      const contentType = response.headers.get('Content-Type');
      
      if (contentType && contentType.includes('application/json')) {
        // Handle regular JSON response
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to review code');
        }
        
        const data = await response.json();
        
        setReviewResult(data.review);
        setReviewProgress({
          status: 'completed',
          progress: 100
        });
        
        setToast({
          message: 'Code review completed!',
          type: 'success'
        });
        
        // Save to localStorage
        if (isLocalStorageAvailable()) {
          saveReview(code, language, data.review);
          window.dispatchEvent(new Event('reviewsUpdated'));
        }
        
        return;
      }
      
      // If we reached here, it's a streaming response
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('Failed to get stream reader');
      }
      
      // Function to process chunks
      const processChunk = async () => {
        let streamData = '';
        const decoder = new TextDecoder();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            // Decode the chunk
            const chunkText = decoder.decode(value, { stream: true });
            streamData += chunkText;
            
            // Process SSE messages
            const messages = streamData.split('\n\n');
            
            // Keep the last part if it doesn't end with \n\n
            const lastPart = messages.pop() || '';
            streamData = lastPart;
            
            // Process each complete message
            for (const message of messages) {
              if (message.trim() === '') continue;
              
              // Parse "data: {...}" format
              const dataMatch = message.match(/^data:\s*(.+)$/m);
              if (dataMatch && dataMatch[1]) {
                try {
                  const data = JSON.parse(dataMatch[1]);
                  
                  // Handle progress
                  if (data.status === 'analyzing') {
                    setReviewProgress({
                      status: 'analyzing',
                      progress: data.progress || 0,
                      message: data.message || getProgressMessage(data.progress || 0)
                    });
                  }
                  
                  // Handle completion
                  if (data.status === 'completed' && data.review) {
                    setReviewResult(data.review);
                    setReviewProgress({
                      status: 'completed',
                      progress: 100
                    });
                    
                    // Save to localStorage
                    if (isLocalStorageAvailable()) {
                      saveReview(code, language, data.review);
                      window.dispatchEvent(new Event('reviewsUpdated'));
                    }
                    
                    setToast({
                      message: 'Code review completed!',
                      type: 'success'
                    });
                  }
                  
                  // Handle errors
                  if (data.status === 'error') {
                    handleReviewError(data.message || 'An error occurred during the code review');
                  }
                } catch (e) {
                  console.error('Error parsing message:', e, dataMatch[1]);
                }
              }
            }
          }
        } catch (e) {
          console.error('Error reading stream:', e);
          throw e;
        }
      };
      
      // Start processing the stream
      await processChunk();
      
    } catch (err) {
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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