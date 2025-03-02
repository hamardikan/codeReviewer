'use client';

import React from 'react';
import { Info } from 'lucide-react';

interface ReviewSummaryProps {
  summary: string;
  isLoading?: boolean;
}

export default function ReviewSummary({ summary, isLoading = false }: ReviewSummaryProps) {
  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-3 bg-gray-200 rounded w-full mb-3"></div>
        <div className="h-3 bg-gray-200 rounded w-4/5 mb-3"></div>
        <div className="h-3 bg-gray-200 rounded w-5/6"></div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-100 rounded-lg p-6 mb-6">
      <div className="flex items-start">
        <Info className="h-5 w-5 text-green-600 mr-3 mt-1 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-medium text-green-800 mb-2">Review Summary</h3>
          <div className="text-green-700 whitespace-pre-wrap">
            {summary.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'mb-4' : 'mb-2'}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}