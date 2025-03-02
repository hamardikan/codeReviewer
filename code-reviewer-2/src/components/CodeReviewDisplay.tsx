'use client';

import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ReviewSummary from './ReviewSummary';
import SuggestionsList from './SuggestionsList';
import CleanCodeView from './CleanCodeView';
import { ReviewState } from '@/hooks/useReviewStream';

interface CodeReviewDisplayProps {
  reviewState: ReviewState;
  onUpdateSuggestion: (suggestionId: string, accepted: boolean | null) => void;
  onRepairParsing: () => void;
  originalCode?: string; // Add this new prop
}

export default function CodeReviewDisplay({
  reviewState,
  onUpdateSuggestion,
  onRepairParsing,
  originalCode
}: CodeReviewDisplayProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'clean-code'>('suggestions');
  
  // Handle loading states
  if (reviewState.status === 'loading' || reviewState.status === 'streaming') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center space-x-2 py-4 text-green-600">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="font-medium">
            {reviewState.status === 'loading' ? 'Starting review...' : 'Analyzing your code...'}
          </span>
        </div>
        
        {reviewState.status === 'streaming' && reviewState.rawText && (
          <div className="mt-4">
            <ReviewSummary summary={reviewState.parsed.summary || 'Generating summary...'} isLoading={!reviewState.parsed.summary} />
            
            {activeTab === 'suggestions' && (
              <SuggestionsList 
                suggestions={reviewState.parsed.suggestions} 
                onAccept={onUpdateSuggestion}
                isLoading={reviewState.parsed.suggestions.length === 0}
              />
            )}
            
            {activeTab === 'clean-code' && (
              <CleanCodeView 
                cleanCode={reviewState.parsed.cleanCode || 'Generating improved code...'}
                isLoading={!reviewState.parsed.cleanCode}
                suggestions={reviewState.parsed.suggestions}
                languageId={reviewState.language?.id}
              />
            )}
          </div>
        )}
      </div>
    );
  }
  
  // Handle error states
  if (reviewState.status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6">
        <div className="flex items-start">
          <AlertTriangle className="h-6 w-6 text-red-600 mr-3 mt-1 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-medium text-red-800 mb-2">Error During Review</h3>
            <p className="text-red-700 mb-4">{reviewState.error || 'An unexpected error occurred during the code review.'}</p>
            
            {reviewState.rawText && (
              <div className="mt-4 p-4 bg-white rounded border font-mono text-sm whitespace-pre-wrap max-h-96 overflow-auto">
                <h4 className="font-medium mb-2 text-gray-700">Partial Response:</h4>
                {reviewState.rawText}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Handle parsing error
  if (reviewState.parseError) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-yellow-800">Formatting Issue</h3>
              <p className="mt-1 text-yellow-700">
                {reviewState.parseError}
              </p>
              <button
                onClick={onRepairParsing}
                className="mt-3 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded"
              >
                {reviewState.status === 'repairing' ? (
                  <span className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Repairing...
                  </span>
                ) : (
                  'Attempt Repair'
                )}
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="font-medium text-gray-700 mb-2">Raw Response:</h3>
          <pre className="mt-2 p-4 bg-gray-50 rounded font-mono text-sm whitespace-pre-wrap max-h-96 overflow-auto">
            {reviewState.rawText}
          </pre>
        </div>
      </div>
    );
  }
  
  // Display completed review
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'suggestions' | 'clean-code')}>
        <TabsList className="bg-gray-100 p-1 rounded-lg mb-6">
          <TabsTrigger
            value="suggestions"
            className="px-4 py-2 rounded"
          >
            Suggestions ({reviewState.parsed.suggestions.length})
          </TabsTrigger>
          <TabsTrigger
            value="clean-code"
            className="px-4 py-2 rounded"
          >
            Clean Code
          </TabsTrigger>
        </TabsList>
        
        <ReviewSummary summary={reviewState.parsed.summary} />
        
        <TabsContent value="suggestions">
          <SuggestionsList
            suggestions={reviewState.parsed.suggestions}
            onAccept={onUpdateSuggestion}
          />
        </TabsContent>
        
        <TabsContent value="clean-code">
          <CleanCodeView 
            cleanCode={reviewState.parsed.cleanCode} 
            originalCode={originalCode}
            suggestions={reviewState.parsed.suggestions}
            languageId={reviewState.language.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}