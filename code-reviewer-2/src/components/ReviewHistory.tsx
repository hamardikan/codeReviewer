'use client';

import React from 'react';
import { formatDistance } from 'date-fns';
import { Clock, Code, ChevronRight } from 'lucide-react';
import { CodeReviewResponse } from '@/lib/prompts';

interface HistoryReview {
  id: string;
  timestamp: number;
  parsedResponse: CodeReviewResponse;
  rawText: string;
}

interface ReviewHistoryProps {
  reviews: HistoryReview[];
  onSelectReview: (review: HistoryReview) => void;
}

export default function ReviewHistory({ reviews, onSelectReview }: ReviewHistoryProps) {
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
  const getReviewTitle = (review: HistoryReview): string => {
    // Try to extract a function or class name from the code
    const functionMatch = review.rawText.match(/function\s+(\w+)/);
    const classMatch = review.rawText.match(/class\s+(\w+)/);
    
    if (functionMatch) {
      return `${functionMatch[1]}() function`;
    } else if (classMatch) {
      return `${classMatch[1]} class`;
    } else {
      // Get first line with content if no function/class name found
      const firstLine = review.rawText
        .split('\n')
        .map(line => line.trim())
        .find(line => line.length > 0);
        
      return firstLine && firstLine.length > 30 
        ? `${firstLine.substring(0, 30)}...` 
        : (firstLine || `Review ${review.id.substring(0, 6)}`);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-green-600">Review History</h2>
      
      <div className="space-y-4">
        {reviews.map(review => (
          <div 
            key={review.id} 
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
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
                </div>
              </div>
              <div className="flex items-center text-gray-500 hover:text-green-600">
                <span className="text-sm mr-1">View</span>
                <ChevronRight className="h-4 w-4" />
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