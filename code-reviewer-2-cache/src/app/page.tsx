'use client';

export const maxDuration = 60;
import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CodeInput from '@/components/CodeInput';
import CodeReviewDisplay from '@/components/CodeReviewDisplay';
import ReviewHistory from '@/components/ReviewHistory';
import { useReviewStream } from '@/hooks/useReviewStream';
import { loadReviews, StoredReview } from '@/lib/storage-utils';
import { getLanguageById} from '@/lib/language-utils';

export default function Home() {
  const { reviewState, startReview, updateSuggestion, repairParsing } = useReviewStream();
  const [activeTab, setActiveTab] = useState('new-review');
  const [reviews, setReviews] = useState<StoredReview[]>([]);
  const [selectedHistoryReview, setSelectedHistoryReview] = useState<StoredReview | null>(null);
  const [originalCode, setOriginalCode] = useState<string>('');
  
  // Load reviews on client-side only
  useEffect(() => {
    setReviews(loadReviews());
  }, []);
  
  // Start a code review
  const handleSubmitCode = (code: string, language: string, filename?: string) => {
    setOriginalCode(code); // Store the original code
    const languageObj = getLanguageById(language);
    startReview(code, languageObj, filename);
    setActiveTab('review');
    setSelectedHistoryReview(null);
  };
  
  // Handle selecting a review from history
  const handleSelectReview = (review: StoredReview) => {
    setSelectedHistoryReview(review);
    setActiveTab('review');
  };
  
  // Refresh reviews from storage
  const refreshReviews = () => {
    setReviews(loadReviews());
  };

  // Update reviews when active tab changes to history
  useEffect(() => {
    if (activeTab === 'history') {
      refreshReviews();
    }
  }, [activeTab]);
  
  return (
    <main className="min-h-screen bg-white p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-green-600">Code Review AI</h1>
        <p className="text-gray-600">AI-powered code reviews using clean code principles</p>
      </header>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100 p-1 rounded-lg mb-6">
          <TabsTrigger 
            value="new-review" 
            className="px-4 py-2 rounded"
          >
            New Review
          </TabsTrigger>
          
          <TabsTrigger 
            value="review" 
            className="px-4 py-2 rounded"
            disabled={reviewState.status === 'idle' && !selectedHistoryReview}
          >
            Current Review
          </TabsTrigger>
          
          <TabsTrigger 
            value="history" 
            className="px-4 py-2 rounded"
          >
            History
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="new-review">
          <CodeInput 
            onSubmit={handleSubmitCode} 
            isSubmitting={reviewState.status === 'loading'} 
          />
        </TabsContent>
        
        <TabsContent value="review">
          {selectedHistoryReview ? (
            // Display selected history review
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-green-600">Review from History</h2>
                <button 
                  onClick={() => setSelectedHistoryReview(null)} 
                  className="text-sm text-green-600 hover:text-green-800"
                >
                  Return to active review
                </button>
              </div>
              <CodeReviewDisplay 
                reviewState={{
                  reviewId: selectedHistoryReview.id,
                  status: 'completed',
                  rawText: '',
                  parsed: {
                    summary: selectedHistoryReview.parsedResponse.summary,
                    suggestions: selectedHistoryReview.parsedResponse.suggestions,
                    cleanCode: selectedHistoryReview.parsedResponse.cleanCode
                  },
                  parseError: null,
                  error: null,
                  language: getLanguageById(selectedHistoryReview.language)
                }}
                onUpdateSuggestion={() => {/* No-op for history reviews */}}
                onRepairParsing={() => {/* No-op for history reviews */}}
              />
            </div>
          ) : reviewState.status !== 'idle' ? (
            // Display active review
            <CodeReviewDisplay 
              reviewState={reviewState}
              onUpdateSuggestion={updateSuggestion}
              onRepairParsing={repairParsing}
              originalCode={originalCode}
            />
          ) : (
            // No review selected
            <div className="p-6 text-center border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-600">No active review. Submit code or select from history.</p>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="history">
          <ReviewHistory 
            reviews={reviews} 
            onSelectReview={handleSelectReview}
            onRefresh={refreshReviews} 
          />
        </TabsContent>
      </Tabs>
      
      <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>Code Review AI • Powered by Gemini • {new Date().getFullYear()}</p>
      </footer>
    </main>
  );
}