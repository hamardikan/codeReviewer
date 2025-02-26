'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import ReviewDisplay from '@/components/ReviewDisplay';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getReviewById, updateReview } from '@/lib/localStorage';
import { ReviewHistoryItem } from '@/lib/localStorage';

export default function ReviewPage() {
  const params = useParams();
  const reviewId = params.id as string;
  
  const [review, setReview] = useState<ReviewHistoryItem | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);

  // Load review from local storage
  useEffect(() => {
    if (reviewId) {
      const foundReview = getReviewById(reviewId);
      if (foundReview) {
        setReview(foundReview);
        setNewName(foundReview.name);
      } else {
        setIsNotFound(true);
      }
    }
  }, [reviewId]);

  // Handle rename submission
  const handleRename = () => {
    if (review && newName.trim() !== '') {
      updateReview(review.id, { name: newName.trim() });
      setReview({
        ...review,
        name: newName.trim()
      });
      setIsRenaming(false);
    }
  };

  // Handle key press in rename input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(review?.name || '');
    }
  };

  if (isNotFound) {
    return (
      <ThemeProvider>
        <MainLayout>
          <div className="p-6 max-w-4xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Review Not Found</h1>
            <p className="mb-6">The review you&apos;re looking for doesn&apos;t exist or may have been deleted.</p>
            <Link 
              href="/"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to New Review
            </Link>
          </div>
        </MainLayout>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <MainLayout activeReviewId={reviewId}>
        <div className="p-6 max-w-6xl mx-auto">
          {review ? (
            <>
              <div className="flex justify-between items-center mb-6">
                {isRenaming ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="px-2 py-1 border rounded mr-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <button
                      onClick={handleRename}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsRenaming(false);
                        setNewName(review.name);
                      }}
                      className="px-3 py-1 text-sm ml-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <h1 className="text-2xl font-bold">{review.name}</h1>
                    <button
                      onClick={() => setIsRenaming(true)}
                      className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}

                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span>{new Date(review.timestamp).toLocaleString()}</span>
                  <span className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">
                    {review.language}
                  </span>
                </div>
              </div>

              <ReviewDisplay
                originalCode={review.originalCode}
                review={review.review}
                language={review.language}
              />
            </>
          ) : (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}