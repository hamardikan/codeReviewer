'use client';

export const maxDuration = 60;
import React, { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import CodeEditor from '@/components/CodeEditor';
import ReviewDisplay from '@/components/ReviewDisplay';
import IssueSelection from '@/components/IssueSelection';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { saveReview, isLocalStorageAvailable } from '@/lib/localStorage';
import { CodeReviewResponse, CodeIssueDetectionResponse, CodeImplementationResponse } from '@/lib/gemini';
import Toast, { ToastType } from '@/components/Toast';

interface ReviewFocus {
  cleanCode: boolean;
  performance: boolean;
  security: boolean;
}

interface ReviewProgressState {
  status: 'idle' | 'chunking' | 'detecting' | 'detected' | 'implementing' | 'implemented' | 'error';
  progress: number;
  message?: string;
  chunkInfo?: {
    processed: number;
    total: number;
  };
}

export default function HomePage() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [reviewResult, setReviewResult] = useState<CodeReviewResponse | null>(null);
  const [detectionResult, setDetectionResult] = useState<CodeIssueDetectionResponse | null>(null);
  const [partialIssues, setPartialIssues] = useState<CodeIssueDetectionResponse['issues']>([]);
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
  // Two-phase review state
  const [currentPhase, setCurrentPhase] = useState<'input' | 'detection' | 'selection' | 'implementation' | 'complete'>('input');
  
  // Use a ref to track the abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check if code is empty
  const isCodeEmpty = code.trim() === '';
  const isReviewing = ['chunking', 'detecting', 'implementing'].includes(reviewProgress.status);
  const isChunkedProcessing = (reviewProgress.status === 'detecting' || reviewProgress.status === 'implementing') && reviewProgress.chunkInfo;
  
  // Helper function to generate progress messages based on percentage
  const getProgressMessage = (progress: number, status: string): string => {
    if (status === 'detecting') {
      if (progress < 15) return 'Starting code analysis...';
      if (progress < 25) return 'Analyzing code structure...';
      if (progress < 50) return 'Identifying potential issues...';
      if (progress < 75) return 'Evaluating code quality...';
      if (progress < 90) return 'Finalizing analysis...';
      return 'Preparing results...';
    } else if (status === 'implementing') {
      if (progress < 15) return 'Preparing to implement changes...';
      if (progress < 30) return 'Planning code modifications...';
      if (progress < 60) return 'Applying approved changes...';
      if (progress < 80) return 'Verifying code integrity...';
      if (progress < 95) return 'Finalizing implementation...';
      return 'Completing review...';
    }
    
    return 'Processing...';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Handle phase 1: code issue detection
  const handleDetectIssues = async () => {
    if (isCodeEmpty) {
      setError('Please enter some code to review.');
      return;
    }

    // Reset previous results and errors
    setDetectionResult(null);
    setReviewResult(null);
    setPartialIssues([]);
    setError(null);
    
    // Cancel any ongoing review
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Update phase and progress
    setCurrentPhase('detection');
    setReviewProgress({
      status: 'detecting',
      progress: 5,
      message: 'Starting code analysis...'
    });

    try {
      // Start the detection as a streaming process
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
          reviewFocus,
          phase: 'detection' // Specify detection phase
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
                  // Extract chunk info if available
                  let chunkInfo = undefined;
                  if (parsedData.status === 'detecting' && 
                      parsedData.processed !== undefined && 
                      parsedData.total !== undefined) {
                    chunkInfo = {
                      processed: parsedData.processed,
                      total: parsedData.total
                    };
                  }
                  
                  setReviewProgress({
                    status: parsedData.status,
                    progress: parsedData.progress || 0,
                    message: parsedData.message || getProgressMessage(parsedData.progress || 0, parsedData.status),
                    chunkInfo
                  });
                  break;
                  
                case 'update':
                  // Handle partial issues separately
                  if (parsedData.partialIssues && Array.isArray(parsedData.partialIssues)) {
                    setPartialIssues(prev => {
                      // Combine with previous partial issues, avoiding duplicates
                      const newIssues = [...prev];
                      for (const issue of parsedData.partialIssues) {
                        // Simple deduplication based on description
                        if (!newIssues.some(existingIssue => 
                          existingIssue.description === issue.description)) {
                          newIssues.push(issue);
                        }
                      }
                      return newIssues;
                    });
                  }
                  break;
                  
                case 'detection':
                  // Process the detection result
                  setDetectionResult(parsedData);
                  setReviewProgress({
                    status: 'detected',
                    progress: 100
                  });
                  
                  // Also set an initial review result for display purposes
                  setReviewResult({
                    phase: 'detection',
                    summary: parsedData.summary,
                    issues: parsedData.issues,
                    suggestions: [],  // No suggestions yet until implementation phase
                    improvedCode: code,  // Original code for now
                    codeQualityScore: parsedData.codeQualityScore
                  });
                  
                  setToast({
                    message: 'Code analysis completed!',
                    type: 'success'
                  });
                  
                  // Move to selection phase
                  setCurrentPhase('selection');
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
  
  // Handle phase 2: implement selected changes
  const handleImplementChanges = async (approvedIssues: string[], seniorFeedback: Record<string, string>) => {
    if (!detectionResult) {
      setError('No detection results available.');
      return;
    }
    
    // Get the full issue data for approved issues
    const approvedIssueData = detectionResult.issues.filter(issue => 
      approvedIssues.includes(issue.id)
    );
    
    // Update phase and progress
    setCurrentPhase('implementation');
    setReviewProgress({
      status: 'implementing',
      progress: 5,
      message: 'Starting implementation of approved changes...'
    });
    
    // Cancel any ongoing review
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      // Call the implementation API with the approved issue data
      const response = await fetch('/api/implement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
          reviewFocus,
          approvedIssues,
          approvedIssueData,
          seniorFeedback,
          codeQualityScore: detectionResult.codeQualityScore
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      // Parse the implementation result
      const implementationResult = await response.json();
      
      // Update progress to 100%
      setReviewProgress({
        status: 'implemented',
        progress: 100,
        message: 'Implementation complete'
      });
      
      // Create suggestions from the codeChanges
      const suggestions = implementationResult.codeChanges?.map((change: any) => {
        // Find the original issue this change applies to
        const matchingIssue = approvedIssueData.find(issue => issue.id === change.issueId);
        
        return {
          description: matchingIssue?.proposedSolution || 'Applied approved change',
          before: change.before,
          after: change.after,
          benefits: matchingIssue?.impact || 'Improves code quality'
        };
      }) || [];
      
      // Create combined result for ReviewDisplay
      const combinedResult: CodeReviewResponse = {
        phase: 'complete',
        summary: detectionResult.summary,
        issues: approvedIssueData,
        suggestions: suggestions,
        improvedCode: implementationResult.improvedCode || code,
        learningResources: (detectionResult as any).learningResources || [],
        seniorReviewTime: {
          before: "10 minutes",  // Placeholder values
          after: "2 minutes",
          timeSaved: "8 minutes"
        },
        codeQualityScore: detectionResult.codeQualityScore
      };
      
      // Set the review result
      setReviewResult(combinedResult);
      
      // Save to localStorage
      if (isLocalStorageAvailable()) {
        saveReview(code, language, combinedResult);
        window.dispatchEvent(new Event('reviewsUpdated'));
      }
      
      // Show success toast
      setToast({
        message: 'Implementation completed!',
        type: 'success'
      });
      
      // Move to complete phase
      setCurrentPhase('complete');
      
      // Clear the abort controller reference
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
    
    // Reset phase
    setCurrentPhase('input');
    
    setToast({
      message: 'Code review cancelled',
      type: 'info'
    });
  };
  
  // Handle cancellation from selection phase
  const handleCancelSelection = () => {
    setCurrentPhase('input');
    setDetectionResult(null);
  };

  // Render partial issues while processing chunks
  const renderPartialIssues = () => {
    if (partialIssues.length === 0) return null;
    
    return (
      <div className="mt-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3">Issues Found So Far ({partialIssues.length})</h3>
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {partialIssues.slice(0, 5).map((issue, index) => (
            <div 
              key={`partial-issue-${index}`}
              className="p-3 border-l-4 rounded bg-white dark:bg-gray-700 border-yellow-500 dark:border-yellow-600"
            >
              <div className="font-medium">{issue.type}</div>
              <p className="text-sm mt-1">{issue.description}</p>
              {issue.lineNumbers && issue.lineNumbers.length > 0 && (
                <div className="mt-1 text-xs">
                  <span className="font-medium">Lines: </span>
                  {issue.lineNumbers.join(', ')}
                </div>
              )}
            </div>
          ))}
          {partialIssues.length > 5 && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              +{partialIssues.length - 5} more issues found
            </div>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          These are preliminary findings from processing chunks of your code.
          The final analysis will include prioritized issues for your review.
        </div>
      </div>
    );
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
          {currentPhase === 'input' || currentPhase === 'detection' ? (
            <div>
              <h1 className="text-2xl font-bold mb-6">New Code Review</h1>
              
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded dark:bg-red-900 dark:bg-opacity-30 dark:text-red-200 dark:border-red-700">
                  {error}
                </div>
              )}
              
              {/* Progress Indicator */}
              {isReviewing && (
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
                  
                  {/* Chunk processing info */}
                  {isChunkedProcessing && reviewProgress.chunkInfo && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <div className="mr-2">Processing chunks:</div>
                      <div className="flex space-x-1">
                        {Array.from({ length: reviewProgress.chunkInfo.total }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-2 h-2 rounded-full ${
                              i < reviewProgress.chunkInfo!.processed 
                                ? 'bg-green-500' 
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          ></div>
                        ))}
                      </div>
                      <div className="ml-2">
                        {reviewProgress.chunkInfo.processed} of {reviewProgress.chunkInfo.total} completed
                      </div>
                    </div>
                  )}
                  
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
              
              {/* Display partial issues while processing */}
              {isReviewing && reviewProgress.progress > 20 && renderPartialIssues()}
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleDetectIssues}
                  disabled={isReviewing || isCodeEmpty}
                  className={`
                    px-6 py-3 rounded-lg font-medium
                    ${isReviewing || isCodeEmpty
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                    }
                  `}
                >
                  {isReviewing ? 'Analyzing...' : 'Analyze Code'}
                </button>
              </div>
            </div>
          ) : currentPhase === 'selection' && detectionResult ? (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Senior Developer Review</h1>
                <div className="text-sm text-gray-500">
                  <span className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">
                    {language}
                  </span>
                </div>
              </div>
              
              <IssueSelection
                detectionResult={detectionResult}
                onImplement={handleImplementChanges}
                onCancel={handleCancelSelection}
                originalCode={code}
                language={language}
              />
            </div>
          ) : currentPhase === 'implementation' ? (
            <div>
              <h1 className="text-2xl font-bold mb-6">Implementing Changes</h1>
              
              {/* Progress Indicator */}
              <div className="mb-10">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm font-medium">
                    {reviewProgress.message || 'Implementing approved changes...'}
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
              
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-500">Implementing approved changes...</p>
                  <p className="text-sm text-gray-400 mt-2">This may take a moment</p>
                </div>
              </div>
            </div>
          ) : currentPhase === 'complete' && reviewResult ? (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Code Review Results</h1>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setCurrentPhase('input');
                      setReviewResult(null);
                      setDetectionResult(null);
                      setPartialIssues([]);
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
              
              <ReviewDisplay
                originalCode={code}
                review={reviewResult}
                language={language}
              />
            </div>
          ) : null}
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}