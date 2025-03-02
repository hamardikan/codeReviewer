'use client';

import React from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { CodeSuggestion } from '@/lib/prompts';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface SuggestionsListProps {
  suggestions: CodeSuggestion[];
  onAccept: (suggestionId: string, accepted: boolean | null) => void;
  isLoading?: boolean;
}

export default function SuggestionsList({ 
  suggestions, 
  onAccept, 
  isLoading = false 
}: SuggestionsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((item) => (
          <div key={item} className="border border-gray-200 rounded-lg overflow-hidden animate-pulse">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div className="p-4">
              <div className="h-20 bg-gray-100 rounded mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-10 border border-gray-200 rounded-lg">
        <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-600">No suggestions available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {suggestions.map((suggestion) => (
        <div 
          key={suggestion.id} 
          className={`border rounded-lg overflow-hidden ${
            suggestion.accepted === true 
              ? 'border-green-200 bg-green-50/30' 
              : suggestion.accepted === false 
                ? 'border-red-200 bg-red-50/30' 
                : 'border-gray-200'
          }`}
        >
          <div className="flex justify-between items-center bg-gray-50 px-4 py-2 border-b border-gray-200">
            <span className="text-gray-600">Line {suggestion.lineNumber}</span>
            <div className="flex space-x-2">
              <button 
                onClick={() => onAccept(suggestion.id, true)}
                className={`p-1 rounded-full hover:bg-green-100 ${
                  suggestion.accepted === true ? 'text-green-600 bg-green-100' : 'text-gray-500'
                }`}
                title="Accept suggestion"
              >
                <Check className="h-5 w-5" />
              </button>
              <button 
                onClick={() => onAccept(suggestion.id, false)}
                className={`p-1 rounded-full hover:bg-red-100 ${
                  suggestion.accepted === false ? 'text-red-600 bg-red-100' : 'text-gray-500'
                }`}
                title="Reject suggestion"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          <div className="p-4">
            <div className="flex flex-col space-y-2 mb-4">
              <div className="bg-red-50 rounded-md">
                <div className="px-3 py-1 text-xs text-red-700 border-b border-red-200">Original</div>
                <SyntaxHighlighter
                  language="javascript"
                  style={vs2015}
                  customStyle={{ background: 'transparent', padding: '0.75rem' }}
                >
                  {suggestion.originalCode}
                </SyntaxHighlighter>
              </div>
              
              <div className="bg-green-50 rounded-md">
                <div className="px-3 py-1 text-xs text-green-700 border-b border-green-200">Suggested</div>
                <SyntaxHighlighter
                  language="javascript"
                  style={vs2015}
                  customStyle={{ background: 'transparent', padding: '0.75rem' }}
                >
                  {suggestion.suggestedCode}
                </SyntaxHighlighter>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
              <h4 className="font-medium mb-1">Explanation:</h4>
              <p>{suggestion.explanation}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}