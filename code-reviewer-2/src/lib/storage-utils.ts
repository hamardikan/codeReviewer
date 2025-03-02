import LZString from 'lz-string';
import { CodeReviewResponse, CodeSuggestion } from './prompts';

/**
 * Maximum number of reviews to store in history
 */
const MAX_HISTORY_ITEMS = 10;

/**
 * Structure of a review for storage
 */
export interface StoredReview {
  id: string;
  timestamp: number;
  parsedResponse: {
    summary: string;
    suggestions: Pick<CodeSuggestion, 'id' | 'lineNumber' | 'originalCode' | 'suggestedCode' | 'explanation' | 'accepted'>[];
    cleanCode: string;
  };
  language: string;
  filename?: string;
}

/**
 * Check if we're running in a browser environment where localStorage is available
 */
const isBrowser = typeof window !== 'undefined';

/**
 * Compresses a string using LZ-based compression
 * @param data - String to compress
 * @returns Compressed string
 */
function compressData(data: string): string {
  return LZString.compressToUTF16(data);
}

/**
 * Decompresses a previously compressed string
 * @param compressed - Compressed string
 * @returns Original string or empty string if decompression fails
 */
function decompressData(compressed: string): string {
  try {
    const decompressed = LZString.decompressFromUTF16(compressed);
    return decompressed || '';
  } catch (error) {
    console.error('Error decompressing data:', error);
    return '';
  }
}

/**
 * Save reviews to local storage with compression
 * @param reviews - Array of review objects to store
 */
export function saveReviews(reviews: StoredReview[]): void {
  if (!isBrowser) return;
  
  try {
    // Limit to maximum number of items
    const limitedReviews = reviews.slice(0, MAX_HISTORY_ITEMS);
    
    // Compress the stringified data
    const compressed = compressData(JSON.stringify(limitedReviews));
    
    // Store the compressed data
    localStorage.setItem('code-reviews-compressed', compressed);
  } catch (error) {
    console.error('Error saving reviews to localStorage:', error);
    
    // If there's an error, try to save fewer items
    if (reviews.length > 1) {
      saveReviews(reviews.slice(0, Math.floor(reviews.length / 2)));
    }
  }
}

/**
 * Load reviews from local storage with decompression
 * @returns Array of stored reviews or empty array if none found
 */
export function loadReviews(): StoredReview[] {
  if (!isBrowser) return [];
  
  try {
    // Try to get compressed data
    const compressed = localStorage.getItem('code-reviews-compressed');
    
    if (!compressed) {
      // Check for old format data for migration
      const oldData = localStorage.getItem('code-reviews');
      if (oldData) {
        try {
          const oldReviews = JSON.parse(oldData);
          // Migrate to new format and save
          const migratedReviews = migrateOldReviews(oldReviews);
          saveReviews(migratedReviews);
          // Clean up old storage
          localStorage.removeItem('code-reviews');
          return migratedReviews;
        } catch (e) {
          console.error('Error migrating old reviews:', e);
          return [];
        }
      }
      return [];
    }
    
    // Decompress and parse
    const decompressed = decompressData(compressed);
    return decompressed ? JSON.parse(decompressed) : [];
  } catch (error) {
    console.error('Error loading reviews from localStorage:', error);
    return [];
  }
}

/**
 * Adds a new review to storage
 * @param review - Review to add
 * @returns Updated array of all reviews
 */
export function addReview(review: StoredReview): StoredReview[] {
  if (!isBrowser) return [review];
  
  const existingReviews = loadReviews();
  
  // Remove any existing review with the same ID
  const filteredReviews = existingReviews.filter(r => r.id !== review.id);
  
  // Add new review at the beginning (most recent)
  const updatedReviews = [review, ...filteredReviews];
  
  // Save to storage
  saveReviews(updatedReviews);
  
  return updatedReviews;
}

/**
 * Remove a review from storage by ID
 * @param reviewId - ID of the review to remove
 * @returns Updated array of reviews after removal
 */
export function removeReview(reviewId: string): StoredReview[] {
  if (!isBrowser) return [];
  
  const reviews = loadReviews();
  const updatedReviews = reviews.filter(review => review.id !== reviewId);
  saveReviews(updatedReviews);
  
  return updatedReviews;
}

/**
 * Creates a minimal review object for storage
 * @param id - Review ID
 * @param response - Parsed response
 * @param language - Programming language
 * @param filename - Original filename (optional)
 * @returns Storage-optimized review object
 */
export function createStorableReview(
  id: string, 
  response: CodeReviewResponse,
  language: string,
  filename?: string
): StoredReview {
  return {
    id,
    timestamp: Date.now(),
    parsedResponse: {
      summary: response.summary,
      suggestions: response.suggestions.map(s => ({
        id: s.id,
        lineNumber: s.lineNumber,
        originalCode: s.originalCode,
        suggestedCode: s.suggestedCode,
        explanation: s.explanation,
        accepted: s.accepted
      })),
      cleanCode: response.cleanCode
    },
    language,
    filename
  };
}

/**
 * Migrate old review format to new format
 * @param oldReviews - Reviews in the old format
 * @returns Reviews in the new format
 */
function migrateOldReviews(oldReviews: any[]): StoredReview[] {
  return oldReviews.map(old => ({
    id: old.id,
    timestamp: old.timestamp || Date.now(),
    parsedResponse: {
      summary: old.parsedResponse?.summary || '',
      suggestions: (old.parsedResponse?.suggestions || []).map((s: any) => ({
        id: s.id,
        lineNumber: s.lineNumber,
        originalCode: s.originalCode,
        suggestedCode: s.suggestedCode,
        explanation: s.explanation,
        accepted: s.accepted
      })),
      cleanCode: old.parsedResponse?.cleanCode || ''
    },
    language: old.language || 'javascript',
    filename: old.filename
  }));
}