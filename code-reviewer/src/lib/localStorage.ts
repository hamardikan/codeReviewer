/**
 * Local storage utilities for saving and retrieving code reviews.
 * Provides type-safe access to the browser's localStorage API.
 */

// Import types
import { CodeReviewResponse } from './gemini';

// Review history item stored in local storage
export interface ReviewHistoryItem {
  id: string;
  name: string;
  language: string;
  timestamp: number;
  originalCode: string;
  review: CodeReviewResponse;
}

// Storage keys
const STORAGE_KEYS = {
  REVIEWS: 'code-review-app-reviews',
  THEME: 'code-review-app-theme',
};

/**
 * Saves a new code review to local storage.
 * @param review - The review to save
 * @returns The ID of the saved review
 */
export function saveReview(
    originalCode: string,
    language: string,
    review: CodeReviewResponse
  ): string {
    // Generate a unique ID for the review
    const id = generateId();
    
    // Create a name for the review based on the code content
    const name = createReviewName(originalCode, language);
    
    // Create the review history item
    const reviewItem: ReviewHistoryItem = {
      id,
      name,
      language,
      timestamp: Date.now(),
      originalCode,
      review,
    };
    
    // Get existing reviews
    const reviews = getReviews();
    
    // Add the new review
    reviews.unshift(reviewItem);
    
    // Save the updated reviews
    localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
    
    // Dispatch an event to notify listeners about the change
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('reviewsUpdated'));
    }
    
    return id;
  }

/**
 * Gets all reviews from local storage.
 * @returns Array of review history items
 */
export function getReviews(): ReviewHistoryItem[] {
  try {
    const reviewsJson = localStorage.getItem(STORAGE_KEYS.REVIEWS);
    return reviewsJson ? JSON.parse(reviewsJson) : [];
  } catch (error) {
    console.error('Error retrieving reviews from local storage:', error);
    return [];
  }
}

/**
 * Gets a specific review by ID.
 * @param id - The ID of the review to get
 * @returns The review history item or undefined if not found
 */
export function getReviewById(id: string): ReviewHistoryItem | undefined {
  const reviews = getReviews();
  return reviews.find(review => review.id === id);
}

/**
 * Updates a review in local storage.
 * @param id - The ID of the review to update
 * @param updates - Partial review history item with fields to update
 * @returns Boolean indicating success
 */
export function updateReview(
  id: string,
  updates: Partial<ReviewHistoryItem>
): boolean {
  const reviews = getReviews();
  const index = reviews.findIndex(review => review.id === id);
  
  if (index === -1) {
    return false;
  }
  
  // Update the review
  reviews[index] = { ...reviews[index], ...updates };
  
  // Save the updated reviews
  localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
  
  return true;
}

/**
 * Deletes a review from local storage.
 * @param id - The ID of the review to delete
 * @returns Boolean indicating success
 */
export function deleteReview(id: string): boolean {
  const reviews = getReviews();
  const filteredReviews = reviews.filter(review => review.id !== id);
  
  if (filteredReviews.length === reviews.length) {
    return false;
  }
  
  localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(filteredReviews));
  
  return true;
}

/**
 * Generates a unique ID for a review.
 * @returns Unique ID string
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Creates a name for a review based on the code content.
 * @param code - The code being reviewed
 * @param language - The programming language
 * @returns A name for the review
 */
function createReviewName(code: string, language: string): string {
  // Try to extract a function or class name from the code
  let name = "";
  
  // Look for function or class definitions
  const functionMatch = code.match(/function\s+([a-zA-Z0-9_]+)/);
  const classMatch = code.match(/class\s+([a-zA-Z0-9_]+)/);
  const constMatch = code.match(/const\s+([a-zA-Z0-9_]+)\s*=/);
  const exportMatch = code.match(/export\s+(?:default\s+)?(?:function|class|const)\s+([a-zA-Z0-9_]+)/);
  
  if (exportMatch) {
    name = exportMatch[1];
  } else if (functionMatch) {
    name = functionMatch[1];
  } else if (classMatch) {
    name = classMatch[1];
  } else if (constMatch) {
    name = constMatch[1];
  }
  
  // If no name was found, use a generic name
  if (!name) {
    name = `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
  }
  
  // Add a timestamp suffix for uniqueness
  const date = new Date();
  const timestamp = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  
  return `${name} - ${timestamp}`;
}

/**
 * Checks if local storage is available in the browser.
 * @returns Boolean indicating if local storage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clears all reviews from local storage.
 */
export function clearAllReviews(): void {
  localStorage.removeItem(STORAGE_KEYS.REVIEWS);
}