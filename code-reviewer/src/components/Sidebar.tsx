/**
 * Sidebar component for the code review application.
 * Displays review history and navigation options.
 */
import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ReviewHistoryItem } from '@/lib/localStorage';
import Link from 'next/link';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  reviews: ReviewHistoryItem[];
  activeReviewId?: string;
  onSelectReview?: (reviewId: string) => void;
  onDeleteReview?: (reviewId: string) => void;
}

export default function Sidebar({
  isOpen,
  onToggle,
  reviews,
  activeReviewId,
  onSelectReview,
  onDeleteReview
}: SidebarProps) {
  const { theme } = useTheme();

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <aside 
      className={`
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        transform transition-transform duration-300 ease-in-out
        md:translate-x-0 fixed md:static inset-y-0 left-0 z-30
        w-72 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
        border-r shadow-sm flex flex-col
      `}
    >
      {/* Logo and app name */}
      <div className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" 
              />
            </svg>
          </div>
          <h1 className="font-bold text-xl tracking-tight">CleanCodeAI</h1>
        </div>
        
        {/* Close button (mobile only) */}
        <button 
          className="md:hidden p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={onToggle}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </button>
      </div>
      
      {/* New Review Button */}
      <div className="p-4">
        <Link href="/">
          <button 
            className={`
              w-full py-3 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors
              ${activeReviewId === undefined 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : theme === 'dark' 
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 4v16m8-8H4" 
              />
            </svg>
            <span>New Review</span>
          </button>
        </Link>
      </div>
      
      {/* Review History */}
      <div className="flex-1 overflow-auto px-2">
        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          History
        </div>
        
        {reviews.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500">
            No review history yet
          </div>
        ) : (
          <div className="space-y-1">
            {reviews.map((review) => (
              <div 
                key={review.id} 
                className={`
                  px-3 py-3 rounded-lg cursor-pointer transition-colors
                  ${review.id === activeReviewId
                    ? theme === 'dark' 
                      ? 'bg-blue-900 bg-opacity-30 text-blue-100' 
                      : 'bg-blue-100 text-blue-900'
                    : theme === 'dark'
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
                onClick={() => onSelectReview && onSelectReview(review.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium truncate">{review.name}</div>
                  
                  {/* Delete button */}
                  <button 
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReview && onDeleteReview(review.id);
                    }}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-4 w-4 text-gray-500" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex justify-between items-center mt-1 text-xs">
                  <span className={`px-2 py-1 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    {review.language}
                  </span>
                  <span className="text-gray-500">{formatDate(review.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} text-sm text-gray-500 flex justify-between items-center`}>
        <div>v1.0.0</div>
      </div>
    </aside>
  );
}