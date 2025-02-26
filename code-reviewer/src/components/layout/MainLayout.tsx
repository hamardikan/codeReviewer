/**
 * Main layout component for the code review application.
 * Provides the sidebar, theme toggle, and main content area.
 */
import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { getReviews, deleteReview, ReviewHistoryItem } from '@/lib/localStorage';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ThemeToggle from '@/components/ThemeToggle';

interface MainLayoutProps {
  children: React.ReactNode;
  activeReviewId?: string;
}

export default function MainLayout({ 
  children, 
  activeReviewId
}: MainLayoutProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // Initialize with empty array to avoid hydration mismatch
  const [reviews, setReviews] = useState<ReviewHistoryItem[]>([]);
  // Add a flag to track client-side rendering
  const [isClient, setIsClient] = useState(false);

  // Effect to set client-side rendering flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Effect to fetch reviews after component has mounted (client-side only)
  useEffect(() => {
    if (isClient) {
      setReviews(getReviews());

      // Listen for storage events to update reviews when changed
      const handleStorageChange = () => {
        setReviews(getReviews());
      };

      // Create a custom event for internal updates
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('reviewsUpdated', handleStorageChange);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('reviewsUpdated', handleStorageChange);
      };
    }
  }, [isClient]);

  // Handle review deletion
  const handleDeleteReview = (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this review?');
    if (confirmed) {
      const success = deleteReview(id);
      if (success) {
        setReviews(getReviews());
        // If the deleted review is the active one, navigate back to the home page
        if (id === activeReviewId) {
          router.push('/');
        }
      }
    }
  };

  // Handle review selection
  const handleSelectReview = (id: string) => {
    router.push(`/reviews/${id}`);
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* Only render reviews in the sidebar after client-side hydration */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={toggleSidebar}
        reviews={isClient ? reviews : []}
        activeReviewId={activeReviewId}
        onSelectReview={handleSelectReview}
        onDeleteReview={handleDeleteReview}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className={`flex items-center justify-between p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
          <div className="flex items-center">
            {/* Menu toggle button (mobile) */}
            <button 
              className="md:hidden mr-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={toggleSidebar}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 6h16M4 12h16M4 18h16" 
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold">CleanCodeAI</h1>
          </div>
          
          {/* Right side of header */}
          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}