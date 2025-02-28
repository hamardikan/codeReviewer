/**
 * Code review aggregator module.
 * Combines results from multiple code chunk reviews into a unified response.
 */

import { CodeReviewResponse } from './gemini';
import { CodeChunk } from './chunker';

export interface AggregationOptions {
  /**
   * Duplicate detection threshold (0-1) - higher values are more strict
   * about considering issues as duplicates
   */
  deduplicationThreshold?: number;
  /**
   * Strategy for handling conflicts in improved code
   * - 'first': Use the first improvement
   * - 'last': Use the last improvement
   * - 'smart': Try to intelligently merge improvements
   */
  conflictStrategy?: 'first' | 'last' | 'smart';
  /**
   * Maximum characters for summaries
   */
  maxSummaryLength?: number;
  /**
   * Whether to normalize line numbers from chunks to full file
   */
  normalizeLineNumbers?: boolean;
}

const DEFAULT_OPTIONS: Required<AggregationOptions> = {
  deduplicationThreshold: 0.75,
  conflictStrategy: 'smart',
  maxSummaryLength: 500,
  normalizeLineNumbers: true,
};

/**
 * Combines multiple code review results into a single unified response
 * 
 * @param chunkReviews Map of chunk IDs to their review results
 * @param chunks Map of chunk IDs to the original chunks
 * @param originalCode The full original code
 * @param options Aggregation options
 * @returns Unified code review response
 */
export function aggregateCodeReviews(
  chunkReviews: Map<string, CodeReviewResponse>,
  chunks: Map<string, CodeChunk>,
  originalCode: string,
  options: AggregationOptions = {}
): CodeReviewResponse {
  // Merge default options with provided options
  const finalOptions: Required<AggregationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Initialize aggregated result
  const aggregatedResult: CodeReviewResponse = {
    summary: '',
    issues: [],
    suggestions: [],
    improvedCode: originalCode,
    learningResources: [],
  };

  // Early return if there are no chunk reviews
  if (chunkReviews.size === 0) {
    aggregatedResult.summary = 'No code review results were generated.';
    return aggregatedResult;
  }

  // Combine summaries
  aggregatedResult.summary = combineChunkSummaries(chunkReviews, finalOptions);

  // Aggregate issues with deduplication
  aggregatedResult.issues = aggregateIssues(chunkReviews, chunks, finalOptions);

  // Aggregate suggestions with deduplication
  aggregatedResult.suggestions = aggregateSuggestions(chunkReviews, chunks, finalOptions);

  // Aggregate learning resources with deduplication
  aggregatedResult.learningResources = aggregateLearningResources(chunkReviews, finalOptions);

  // Reconstruct the improved code
  aggregatedResult.improvedCode = reconstructImprovedCode(
    chunkReviews,
    chunks,
    originalCode,
    finalOptions
  );

  // Estimate time savings
  aggregatedResult.seniorReviewTime = aggregateTimeSavings(chunkReviews);

  return aggregatedResult;
}

/**
 * Combines summaries from multiple chunks into a coherent single summary
 */
function combineChunkSummaries(
  chunkReviews: Map<string, CodeReviewResponse>,
  options: Required<AggregationOptions>
): string {
  if (chunkReviews.size === 0) return '';
  if (chunkReviews.size === 1) {
    const firstReview = chunkReviews.values().next().value;
    return firstReview ? firstReview.summary : '';
  }

  // Extract key points from each summary
  const allSummaries = Array.from(chunkReviews.values()).map(review => review.summary);
  
  // Count the total number of issues and suggestions across all chunks
  const totalIssues = Array.from(chunkReviews.values())
    .reduce((sum, review) => sum + review.issues.length, 0);
  
  const totalSuggestions = Array.from(chunkReviews.values())
    .reduce((sum, review) => sum + review.suggestions.length, 0);
  
  // Generate a new summary based on common themes
  let combinedSummary = `Overall code review identified ${totalIssues} issues and ${totalSuggestions} suggestions for improvement. `;
  
  // Extract common issue types
  const issueTypes = new Map<string, number>();
  for (const review of chunkReviews.values()) {
    for (const issue of review.issues) {
      issueTypes.set(issue.type, (issueTypes.get(issue.type) || 0) + 1);
    }
  }
  
  // Add the most common issue types to the summary
  if (issueTypes.size > 0) {
    const sortedIssueTypes = Array.from(issueTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
    
    combinedSummary += `The most common issues involve ${sortedIssueTypes.join(', ')}. `;
  }
  
  // Try to extract high-level observations from individual summaries
  const observations = extractHighLevelObservations(allSummaries);
  if (observations.length > 0) {
    combinedSummary += observations.join(' ');
  }
  
  // Ensure the summary isn't too long
  if (combinedSummary.length > options.maxSummaryLength) {
    combinedSummary = combinedSummary.substring(0, options.maxSummaryLength - 3) + '...';
  }
  
  return combinedSummary;
}

/**
 * Extract high-level observations from summaries
 */
function extractHighLevelObservations(summaries: string[]): string[] {
  const observations: string[] = [];
  
  // Simple approach: look for sentences with key phrases that indicate high-level observations
  const highLevelPhrases = [
    'overall', 'in general', 'code quality', 'main issue', 'primary concern',
    'consistent pattern', 'would benefit from', 'should focus on', 'the most important'
  ];
  
  for (const summary of summaries) {
    // Split into sentences
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    for (const sentence of sentences) {
      // Check if sentence contains high-level phrases
      if (highLevelPhrases.some(phrase => sentence.toLowerCase().includes(phrase))) {
        const observation = sentence.trim() + '.';
        // Avoid duplicates
        if (!observations.some(o => isSimilarText(o, observation, 0.7))) {
          observations.push(observation);
        }
      }
    }
  }
  
  // Limit to top 3 observations to keep it concise
  return observations.slice(0, 3);
}

/**
 * Aggregate issues from multiple chunks with deduplication
 */
function aggregateIssues(
  chunkReviews: Map<string, CodeReviewResponse>,
  chunks: Map<string, CodeChunk>,
  options: Required<AggregationOptions>
): CodeReviewResponse['issues'] {
  const allIssues: CodeReviewResponse['issues'] = [];
  
  for (const [chunkId, review] of chunkReviews.entries()) {
    const chunk = chunks.get(chunkId);
    if (!chunk) continue;
    
    for (const issue of review.issues) {
      // Normalize line numbers if requested
      if (options.normalizeLineNumbers && issue.lineNumbers && issue.lineNumbers.length > 0) {
        issue.lineNumbers = issue.lineNumbers.map(lineNum => lineNum + chunk.startLine);
      }
      
      // Check if this issue is a duplicate
      const isDuplicate = allIssues.some(existingIssue => 
        isIssueDuplicate(existingIssue, issue, options.deduplicationThreshold)
      );
      
      if (!isDuplicate) {
        allIssues.push(issue);
      }
    }
  }
  
  // Sort issues by severity (critical first)
  return allIssues.sort((a, b) => {
    const severityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    return (severityOrder[a.severity as keyof typeof severityOrder] || 4) - 
           (severityOrder[b.severity as keyof typeof severityOrder] || 4);
  });
}

/**
 * Check if two issues are duplicates
 */
function isIssueDuplicate(
  issue1: CodeReviewResponse['issues'][0],
  issue2: CodeReviewResponse['issues'][0],
  threshold: number
): boolean {
  // Same type and similar description indicates a likely duplicate
  if (issue1.type === issue2.type && isSimilarText(issue1.description, issue2.description, threshold)) {
    return true;
  }
  
  // If line numbers overlap significantly, consider it a duplicate
  if (issue1.lineNumbers && issue2.lineNumbers &&
      issue1.lineNumbers.length > 0 && issue2.lineNumbers.length > 0) {
    const overlap = issue1.lineNumbers.filter(line => issue2.lineNumbers?.includes(line));
    if (overlap.length > 0) {
      // If more than 50% of line numbers overlap, consider it a duplicate
      const overlapRatio = overlap.length / Math.min(issue1.lineNumbers.length, issue2.lineNumbers.length);
      if (overlapRatio >= 0.5) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if two text strings are similar
 */
function isSimilarText(text1: string, text2: string, threshold: number): boolean {
  // Simple similarity check based on character overlap
  const shorter = text1.length < text2.length ? text1 : text2;
  const longer = text1.length < text2.length ? text2 : text1;
  
  // Quick check for exact match
  if (shorter === longer) return true;
  
  // Check similarity ratio
  const editDistance = levenshteinDistance(shorter, longer);
  const similarityRatio = 1 - (editDistance / longer.length);
  
  return similarityRatio >= threshold;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  // Implementation of Levenshtein distance algorithm
  const m = s1.length;
  const n = s2.length;
  
  // Create a matrix of size (m+1) x (n+1)
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize the matrix
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // Deletion
          dp[i][j - 1],     // Insertion
          dp[i - 1][j - 1]  // Substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Aggregate suggestions from multiple chunks with deduplication
 */
function aggregateSuggestions(
  chunkReviews: Map<string, CodeReviewResponse>,
  chunks: Map<string, CodeChunk>,
  options: Required<AggregationOptions>
): CodeReviewResponse['suggestions'] {
  const allSuggestions: CodeReviewResponse['suggestions'] = [];
  
  for (const [chunkId, review] of chunkReviews.entries()) {
    const chunk = chunks.get(chunkId);
    if (!chunk) continue;
    
    for (const suggestion of review.suggestions) {
      // Check if this suggestion is a duplicate
      const isDuplicate = allSuggestions.some(existingSuggestion => 
        isSuggestionDuplicate(existingSuggestion, suggestion, options.deduplicationThreshold)
      );
      
      if (!isDuplicate) {
        allSuggestions.push(suggestion);
      }
    }
  }
  
  return allSuggestions;
}

/**
 * Check if two suggestions are duplicates
 */
function isSuggestionDuplicate(
  suggestion1: CodeReviewResponse['suggestions'][0],
  suggestion2: CodeReviewResponse['suggestions'][0],
  threshold: number
): boolean {
  // Similar descriptions likely indicate duplicates
  if (isSimilarText(suggestion1.description, suggestion2.description, threshold)) {
    return true;
  }
  
  // Similar before and after code indicates duplicates
  if (isSimilarText(suggestion1.before, suggestion2.before, threshold) &&
      isSimilarText(suggestion1.after, suggestion2.after, threshold)) {
    return true;
  }
  
  return false;
}

/**
 * Aggregate learning resources with deduplication
 */
function aggregateLearningResources(
  chunkReviews: Map<string, CodeReviewResponse>,
  options: Required<AggregationOptions>
): CodeReviewResponse['learningResources'] {
  if (!Array.from(chunkReviews.values()).some(review => review.learningResources?.length)) {
    return [];
  }
  
  const allResources: NonNullable<CodeReviewResponse['learningResources']> = [];
  
  for (const review of chunkReviews.values()) {
    if (!review.learningResources) continue;
    
    for (const resource of review.learningResources) {
      // Check if this resource is a duplicate
      const isDuplicate = allResources.some(existingResource => 
        isSimilarText(existingResource.topic, resource.topic, options.deduplicationThreshold)
      );
      
      if (!isDuplicate) {
        allResources.push(resource);
      }
    }
  }
  
  return allResources;
}

/**
 * Reconstruct the improved code from chunk improvements
 */
function reconstructImprovedCode(
  chunkReviews: Map<string, CodeReviewResponse>,
  chunks: Map<string, CodeChunk>,
  originalCode: string,
  options: Required<AggregationOptions>
): string {
  // If there's only one chunk, just use its improved code
  if (chunkReviews.size === 1 && chunks.size === 1) {
    return Array.from(chunkReviews.values())[0].improvedCode;
  }
  
  // Start with the original code
  const originalLines = originalCode.split('\n');
  
  // Create a copy of lines that we'll modify
  const improvedLines = [...originalLines];
  
  // Sort chunks by start line to process them in order
  const sortedChunks = Array.from(chunks.entries())
    .sort(([, a], [, b]) => a.startLine - b.startLine);
  
  // Track which lines have been modified to handle overlaps
  const modifiedLines = new Set<number>();
  
  // Process each chunk's improvements
  for (const [chunkId, chunk] of sortedChunks) {
    const review = chunkReviews.get(chunkId);
    if (!review) continue;
    
    // Skip if the improved code is identical to original or not provided
    if (!review.improvedCode || review.improvedCode === chunk.code) continue;
    
    // Get the chunk original and improved code
    const chunkOriginalLines = chunk.code.split('\n');
    const chunkImprovedLines = review.improvedCode.split('\n');
    
    // If line counts match, we can do a direct replacement
    if (chunkOriginalLines.length === chunkImprovedLines.length) {
      for (let i = 0; i < chunkOriginalLines.length; i++) {
        const globalLineIndex = chunk.startLine + i;
        
        // Only replace if not already modified or using "last" conflict strategy
        if (!modifiedLines.has(globalLineIndex) || options.conflictStrategy === 'last') {
          improvedLines[globalLineIndex] = chunkImprovedLines[i];
          modifiedLines.add(globalLineIndex);
        }
      }
    } else {
      // Line counts don't match - more complex reconstruction needed
      switch (options.conflictStrategy) {
        case 'first':
          // Skip if any lines in this range were already modified
          if (Array.from(modifiedLines).some(line => 
            line >= chunk.startLine && line <= chunk.endLine)) {
            continue;
          }
          
          // Replace the entire chunk
          improvedLines.splice(
            chunk.startLine,
            chunk.endLine - chunk.startLine + 1,
            ...chunkImprovedLines
          );
          
          // Mark all lines as modified
          for (let i = chunk.startLine; i <= chunk.startLine + chunkImprovedLines.length - 1; i++) {
            modifiedLines.add(i);
          }
          break;
          
        case 'last':
          // Replace the entire chunk regardless of previous modifications
          improvedLines.splice(
            chunk.startLine,
            chunk.endLine - chunk.startLine + 1,
            ...chunkImprovedLines
          );
          
          // Mark all lines as modified
          for (let i = chunk.startLine; i <= chunk.startLine + chunkImprovedLines.length - 1; i++) {
            modifiedLines.add(i);
          }
          break;
          
        case 'smart':
          // Attempt to do a smarter merge based on diff analysis
          try {
            const smartMerged = smartMergeCodeChanges(
              originalLines,
              chunk.startLine,
              chunk.endLine,
              chunkImprovedLines,
              Array.from(modifiedLines)
            );
            
            // Apply the smart merge
            for (const [lineIndex, content] of smartMerged) {
              improvedLines[lineIndex] = content;
              modifiedLines.add(lineIndex);
            }
          } catch {
            // Fallback to 'first' strategy on error
            if (!Array.from(modifiedLines).some(line => 
              line >= chunk.startLine && line <= chunk.endLine)) {
              improvedLines.splice(
                chunk.startLine,
                chunk.endLine - chunk.startLine + 1,
                ...chunkImprovedLines
              );
              
              for (let i = chunk.startLine; i <= chunk.startLine + chunkImprovedLines.length - 1; i++) {
                modifiedLines.add(i);
              }
            }
          }
          break;
      }
    }
  }
  
  return improvedLines.join('\n');
}

/**
 * Smart merge of code changes to handle overlapping modifications
 */
function smartMergeCodeChanges(
  originalLines: string[],
  chunkStartLine: number,
  chunkEndLine: number,
  improvedLines: string[],
  alreadyModifiedLines: number[]
): Array<[number, string]> {
  // Map of line index to new content
  const lineChanges: Array<[number, string]> = [];
  
  // We're focusing on non-conflicting changes first
  const chunkOriginalLines = originalLines.slice(chunkStartLine, chunkEndLine + 1);
  
  // Calculate diff between original and improved
  // For simplicity, we're using a very basic diff algorithm here
  // In a real implementation, you would use a more sophisticated diff algorithm
  const diffs = calculateLineDiff(chunkOriginalLines, improvedLines);
  
  for (const diff of diffs) {
    const globalLineIndex = chunkStartLine + diff.originalIndex;
    
    // Skip if line was already modified and this is not a direct match
    if (alreadyModifiedLines.includes(globalLineIndex) && !diff.isDirectMatch) {
      continue;
    }
    
    // Apply the change
    lineChanges.push([globalLineIndex, diff.newContent]);
  }
  
  return lineChanges;
}

/**
 * Basic diff calculation between original and improved lines
 */
interface LineDiff {
  originalIndex: number;
  newContent: string;
  isDirectMatch: boolean; // Whether the lines have 1:1 correspondence
}

function calculateLineDiff(
  originalLines: string[],
  improvedLines: string[]
): LineDiff[] {
  const diffs: LineDiff[] = [];
  
  // Very simple diff implementation - just compare line by line
  // In a real implementation, use a proper diff algorithm
  const minLines = Math.min(originalLines.length, improvedLines.length);
  
  for (let i = 0; i < minLines; i++) {
    if (originalLines[i] !== improvedLines[i]) {
      diffs.push({
        originalIndex: i,
        newContent: improvedLines[i],
        isDirectMatch: true
      });
    }
  }
  
  // Handle added or removed lines
  if (improvedLines.length > originalLines.length) {
    // Lines were added
    for (let i = originalLines.length; i < improvedLines.length; i++) {
      diffs.push({
        originalIndex: originalLines.length - 1, // Append after the last line
        newContent: improvedLines[i],
        isDirectMatch: false
      });
    }
  }
  
  return diffs;
}

/**
 * Aggregate time savings estimates
 */
function aggregateTimeSavings(
  chunkReviews: Map<string, CodeReviewResponse>
): CodeReviewResponse['seniorReviewTime'] {
  // Extract review times from all chunks
  const times = Array.from(chunkReviews.values())
    .map(review => review.seniorReviewTime)
    .filter(Boolean);
  
  if (times.length === 0) return undefined;
  
  // Parse time strings to minutes
  const beforeMinutes = times.reduce((total, time) => {
    return total + parseTimeToMinutes(time!.before);
  }, 0);
  
  const afterMinutes = times.reduce((total, time) => {
    return total + parseTimeToMinutes(time!.after);
  }, 0);
  
  // Calculate time saved
  const timeSavedMinutes = beforeMinutes - afterMinutes;
  
  // Format the results
  return {
    before: formatMinutes(beforeMinutes),
    after: formatMinutes(afterMinutes),
    timeSaved: formatMinutes(timeSavedMinutes)
  };
}

/**
 * Parse time string to minutes
 */
function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+)\s*(minute|min|hour|hr|second|sec)/i);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith('hour') || unit.startsWith('hr')) {
    return value * 60;
  } else if (unit.startsWith('second') || unit.startsWith('sec')) {
    return value / 60;
  } else {
    return value; // Already in minutes
  }
}

/**
 * Format minutes to a time string
 */
function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} seconds`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)} minutes`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
  }
}