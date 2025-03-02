'use client';

import React, { useState } from 'react';
import { formatDistance } from 'date-fns';
import { Clock, Code, ChevronRight, RefreshCw, Trash2, X, AlertTriangle } from 'lucide-react';
import { StoredReview, removeReview } from '@/lib/storage-utils';

interface ReviewHistoryProps {
  reviews: StoredReview[];
  onSelectReview: (review: StoredReview) => void;
  onRefresh?: () => void;
}

export default function ReviewHistory({ reviews, onSelectReview, onRefresh }: ReviewHistoryProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent, reviewId: string) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    setConfirmDelete(reviewId);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    setConfirmDelete(null);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, reviewId: string) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    setDeleteInProgress(true);
    
    try {
      // Remove the review from storage
      removeReview(reviewId);
      
      // Refresh the list
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error deleting review:', error);
    } finally {
      setDeleteInProgress(false);
      setConfirmDelete(null);
    }
  };

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
        <Clock className="h-10 w-10 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600 mb-1">No review history yet</h3>
        <p className="text-gray-500">Submit code for review to see your history here</p>
      </div>
    );
  }

  // Get a simple title from the code content
  const getReviewTitle = (review: StoredReview): string => {
    // Use clean code to extract a potential function or class name
    const cleanCode = review.parsedResponse.cleanCode;
    const functionMatch = cleanCode.match(/function\s+(\w+)/);
    const classMatch = cleanCode.match(/class\s+(\w+)/);
    
    // Try to get the name from the first suggestion if available
    const firstSuggestion = review.parsedResponse.suggestions[0];
    
    if (functionMatch) {
      return `${functionMatch[1]}() function`;
    } else if (classMatch) {
      return `${classMatch[1]} class`;
    } else if (firstSuggestion) {
      // Use the first line of the first suggestion's original code
      const firstLine = firstSuggestion.originalCode.split('\n')[0].trim();
      return firstLine.length > 30 
        ? `${firstLine.substring(0, 30)}...` 
        : firstLine;
    } else {
      // Fallback to a generic title with language
      return `${review.language.charAt(0).toUpperCase() + review.language.slice(1)} Review`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-green-600">Review History</h2>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            className="flex items-center text-gray-600 hover:text-green-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
            title="Refresh history"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            <span>Refresh</span>
          </button>
        )}
      </div>
      
      <div className="space-y-4">
        {reviews.map(review => (
          <div 
            key={review.id} 
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer relative"
            onClick={() => onSelectReview(review)}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium text-gray-900 flex items-center">
                  <Code className="h-4 w-4 mr-2 text-gray-500" />
                  {getReviewTitle(review)}
                </h3>
                <div className="flex items-center mt-1 text-sm text-gray-500">
                  <Clock className="h-3.5 w-3.5 mr-1" /> 
                  <span>{formatDistance(review.timestamp, new Date(), { addSuffix: true })}</span>
                  {review.language && (
                    <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      {review.language}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center">
                {confirmDelete === review.id ? (
                  <div 
                    className="flex items-center space-x-2 bg-red-50 p-1 rounded"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-red-600">Delete?</span>
                    <button
                      onClick={(e) => handleConfirmDelete(e, review.id)}
                      className="p-1 rounded hover:bg-red-100 text-red-600"
                      disabled={deleteInProgress}
                      title="Confirm delete"
                    >
                      {deleteInProgress ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="p-1 rounded hover:bg-gray-200 text-gray-600"
                      disabled={deleteInProgress}
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={(e) => handleDeleteClick(e, review.id)}
                      className="p-1.5 rounded-full hover:bg-red-100 text-gray-500 hover:text-red-600 mr-2"
                      title="Delete review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex items-center text-gray-500 hover:text-green-600">
                      <span className="text-sm mr-1">View</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* Show a snippet of the summary */}
            {review.parsedResponse?.summary && (
              <div className="mt-2 text-sm text-gray-600 line-clamp-2">
                {review.parsedResponse.summary.split('\n')[0]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}