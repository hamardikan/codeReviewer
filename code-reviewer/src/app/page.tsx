'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import CodeEditor from '@/components/CodeEditor';
import ReviewDisplay from '@/components/ReviewDisplay';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { saveReview, isLocalStorageAvailable } from '@/lib/localStorage';

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewFocus, setReviewFocus] = useState({
    cleanCode: true,
    performance: false,
    security: false,
  });
  
  // Check if code is empty
  const isCodeEmpty = code.trim() === '';

  // Handle code review submission
  const handleReviewCode = async () => {
    if (isCodeEmpty) {
      setError('Please enter some code to review.');
      return;
    }

    setIsReviewing(true);
    setError(null);

    try {
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to review code');
      }

      const data = await response.json();
      setReviewResult(data.review);

      // Save review to local storage if available
      if (isLocalStorageAvailable()) {
        const reviewId = saveReview(code, language, data.review);
        
        // Dispatch custom event to notify about the review update
        window.dispatchEvent(new Event('reviewsUpdated'));
        
        // Optionally, redirect to the review page
        // router.push(`/reviews/${reviewId}`);
      }
    } catch (err: any) {
      console.error('Error reviewing code:', err);
      setError(err.message || 'Failed to review code. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  };

  // Handle viewing a specific review
  const viewReview = (reviewId: string) => {
    router.push(`/reviews/${reviewId}`);
  };

  // Handle review focus change
  const handleReviewFocusChange = (focus: keyof typeof reviewFocus) => {
    setReviewFocus(prev => ({
      ...prev,
      [focus]: !prev[focus]
    }));
  };

  return (
    <ThemeProvider>
      <MainLayout>
        <div className="p-6 max-w-6xl mx-auto">
          {!reviewResult ? (
            <div>
              <h1 className="text-2xl font-bold mb-6">New Code Review</h1>
              
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded">
                  {error}
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
                    />
                    <span>Clean Code</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={reviewFocus.performance}
                      onChange={() => handleReviewFocusChange('performance')}
                      className="rounded"
                    />
                    <span>Performance</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={reviewFocus.security}
                      onChange={() => handleReviewFocusChange('security')}
                      className="rounded"
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
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
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
                    onClick={() => setReviewResult(null)}
                    className="px-4 py-2 text-sm rounded border hover:bg-gray-100 dark:hover:bg-gray-700"
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
          )}
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}