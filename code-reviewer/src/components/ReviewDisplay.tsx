/**
 * Review display component for showing code review results.
 * Includes before/after code comparison and structured feedback.
 */
import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CodeReviewResponse } from '@/lib/gemini';

interface ReviewDisplayProps {
  originalCode: string;
  review: CodeReviewResponse;
  language: string;
}

export default function ReviewDisplay({
  originalCode,
  review
}: ReviewDisplayProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'summary' | 'comparison'>('summary');

  // Copy code to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Code copied to clipboard!');
      })
      .catch((error) => {
        console.error('Error copying text: ', error);
      });
  };

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 ${
            activeTab === 'summary'
              ? theme === 'dark'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-blue-600 border-b-2 border-blue-600'
              : theme === 'dark'
                ? 'text-gray-400 hover:text-gray-300'
                : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('summary')}
        >
          Review Summary
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === 'comparison'
              ? theme === 'dark'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-blue-600 border-b-2 border-blue-600'
              : theme === 'dark'
                ? 'text-gray-400 hover:text-gray-300'
                : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('comparison')}
        >
          Code Comparison
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className={`p-4 rounded-lg ${
            theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200 shadow-sm'
          }`}>
            <h3 className="text-lg font-semibold mb-2">Summary</h3>
            <p>{review.summary}</p>

            {/* Time Saved Metrics (if available) */}
            {review.seniorReviewTime && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className={`p-3 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                }`}>
                  <div className="text-xs text-gray-500">Before</div>
                  <div className="font-semibold">{review.seniorReviewTime.before}</div>
                </div>
                <div className={`p-3 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                }`}>
                  <div className="text-xs text-gray-500">After</div>
                  <div className="font-semibold">{review.seniorReviewTime.after}</div>
                </div>
                <div className={`p-3 rounded-lg ${
                  theme === 'dark' ? 'bg-green-900 bg-opacity-30' : 'bg-green-100'
                }`}>
                  <div className={`text-xs ${theme === 'dark' ? 'text-green-300' : 'text-green-600'}`}>Time Saved</div>
                  <div className={`font-semibold ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>
                    {review.seniorReviewTime.timeSaved}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Issues */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Issues ({review.issues.length})</h3>
            <div className="space-y-3">
              {review.issues.map((issue, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded-lg border-l-4 ${
                    issue.severity === 'critical' || issue.severity === 'high'
                      ? theme === 'dark'
                        ? 'border-red-600 bg-red-900 bg-opacity-20'
                        : 'border-red-500 bg-red-50'
                      : issue.severity === 'medium'
                        ? theme === 'dark'
                          ? 'border-yellow-600 bg-yellow-900 bg-opacity-20'
                          : 'border-yellow-500 bg-yellow-50'
                        : theme === 'dark'
                          ? 'border-blue-600 bg-blue-900 bg-opacity-20'
                          : 'border-blue-500 bg-blue-50'
                  }`}
                >
                  <div className="flex justify-between">
                    <div className="font-medium">{issue.type}</div>
                    <div className={`text-xs px-2 py-0.5 rounded ${
                      issue.severity === 'critical'
                        ? 'bg-red-500 text-white'
                        : issue.severity === 'high'
                          ? theme === 'dark'
                            ? 'bg-red-800 text-red-100' 
                            : 'bg-red-100 text-red-800'
                          : issue.severity === 'medium'
                            ? theme === 'dark'
                              ? 'bg-yellow-800 text-yellow-100'
                              : 'bg-yellow-100 text-yellow-800'
                            : theme === 'dark'
                              ? 'bg-blue-800 text-blue-100'
                              : 'bg-blue-100 text-blue-800'
                    }`}>
                      {issue.severity}
                    </div>
                  </div>
                  <p className="mt-2">{issue.description}</p>
                  
                  {issue.lineNumbers && issue.lineNumbers.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Lines: </span>
                      {issue.lineNumbers.join(', ')}
                    </div>
                  )}
                  
                  {issue.impact && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Impact: </span>
                      {issue.impact}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Suggestions ({review.suggestions.length})</h3>
            <div className="space-y-4">
              {review.suggestions.map((suggestion, index) => (
                <div 
                  key={index} 
                  className={`rounded-lg overflow-hidden border ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                  }`}
                >
                  <div className={`px-4 py-3 ${
                    theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                  }`}>
                    <div className="font-medium">{suggestion.description}</div>
                    {suggestion.benefits && (
                      <div className="mt-1 text-sm text-gray-500">
                        {suggestion.benefits}
                      </div>
                    )}
                  </div>

                  {/* Before code */}
                  <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className={`px-4 py-2 flex justify-between items-center ${
                      theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
                    }`}>
                      <div className="text-xs font-medium">Before</div>
                      <button
                        onClick={() => copyToClipboard(suggestion.before)}
                        className={`text-xs ${
                          theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                        }`}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className={`p-3 overflow-x-auto text-sm font-mono ${
                      theme === 'dark' ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-800'
                    }`}>
                      {suggestion.before}
                    </pre>
                  </div>

                  {/* After code */}
                  <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className={`px-4 py-2 flex justify-between items-center ${
                      theme === 'dark' ? 'bg-green-900 bg-opacity-30' : 'bg-green-100'
                    }`}>
                      <div className={`text-xs font-medium ${
                        theme === 'dark' ? 'text-green-200' : 'text-green-800'
                      }`}>
                        After
                      </div>
                      <button
                        onClick={() => copyToClipboard(suggestion.after)}
                        className={`text-xs ${
                          theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                        }`}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className={`p-3 overflow-x-auto text-sm font-mono ${
                      theme === 'dark' ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-800'
                    }`}>
                      {suggestion.after}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Resources */}
          {review.learningResources && review.learningResources.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Learning Resources</h3>
              <div className={`p-4 rounded-lg ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-white border border-gray-200'
              }`}>
                <ul className="space-y-2">
                  {review.learningResources.map((resource, index) => (
                    <li key={index}>
                      <div className="font-medium">{resource.topic}</div>
                      <div className="text-sm text-gray-500">{resource.description}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Code Comparison Tab */}
      {activeTab === 'comparison' && (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-4">
            {/* Original Code */}
            <div className={`rounded-lg overflow-hidden border ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            }`}>
              <div className={`px-4 py-2 flex justify-between items-center ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                <div className="font-medium">Original Code</div>
                <button
                  onClick={() => copyToClipboard(originalCode)}
                  className={`text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}
                >
                  Copy
                </button>
              </div>
              <pre className={`p-4 overflow-auto h-96 text-sm font-mono whitespace-pre ${
                theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-800'
              }`}>
                {originalCode}
              </pre>
            </div>

            {/* Improved Code */}
            <div className={`rounded-lg overflow-hidden border ${
              theme === 'dark' ? 'border-green-700' : 'border-green-300'
            }`}>
              <div className={`px-4 py-2 flex justify-between items-center ${
                theme === 'dark' ? 'bg-green-900 bg-opacity-30' : 'bg-green-100'
              }`}>
                <div className={`font-medium ${
                  theme === 'dark' ? 'text-green-200' : 'text-green-800'
                }`}>
                  Improved Code
                </div>
                <button
                  onClick={() => copyToClipboard(review.improvedCode)}
                  className={`text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}
                >
                  Copy
                </button>
              </div>
              <pre className={`p-4 overflow-auto h-96 text-sm font-mono whitespace-pre ${
                theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-800'
              }`}>
                {review.improvedCode}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}