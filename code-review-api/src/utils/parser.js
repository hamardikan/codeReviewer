'use strict';

const { v4: uuid } = require('uuid');
const { CodeReviewResponse, CodeSuggestion } = require('../models/Review');
const logger = require('./logger');

/**
 * Cleans code blocks by removing Markdown code block syntax
 */
function cleanCodeBlocks(text) {
  if (!text) return '';
  
  // First, check if the entire string is wrapped in code block
  if (/^```[\w]*\n[\s\S]*\n```$/.test(text.trim())) {
    // Remove the opening and closing code block markers
    return text.trim()
      .replace(/^```[\w]*\n/, '') // Remove opening ```language\n
      .replace(/\n```$/, '');     // Remove closing ```
  }
  
  // Handle code blocks without closing markers - common issue with AI responses
  if (/^```[\w]*\n[\s\S]*$/.test(text.trim()) && !text.trim().endsWith('```')) {
    return text.trim().replace(/^```[\w]*\n/, '');
  }
  
  return text;
}

/**
 * Extracts the clean code section with improved robustness
 * Will try multiple patterns to extract the clean code
 */
function extractCleanCode(rawText) {
  // Try to match the standard clean code format
  const standardMatch = rawText.match(
    /(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)([\s\S]*?)$/i
  );
  
  if (standardMatch && standardMatch[1]) {
    const cleanedCode = cleanCodeBlocks(standardMatch[1].trim());
    if (cleanedCode.length > 100) {
      return cleanedCode;
    }
  }
  
  // If standard match fails or produces too little content, try alternate patterns
  
  // Look for markdown code block after clean code marker
  const codeBlockMatch = rawText.match(
    /(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)[\s\n]*(```[\w]*\n[\s\S]*?(?:```|$))/i
  );
  
  if (codeBlockMatch && codeBlockMatch[1]) {
    const cleanedCode = cleanCodeBlocks(codeBlockMatch[1].trim());
    if (cleanedCode.length > 100) {
      return cleanedCode;
    }
  }
  
  // Look for the last major code block in the document as fallback
  const lastCodeBlockMatch = rawText.match(/```[\w]*\n([\s\S]*?)```(?![\s\S]*```)/);
  if (lastCodeBlockMatch && lastCodeBlockMatch[1] && lastCodeBlockMatch[1].length > 300) {
    return lastCodeBlockMatch[1];
  }
  
  // If we still don't have good clean code, look for any section with significant indented code
  const indentedCodeMatch = rawText.match(/(?:Here's the complete improved code:|Here's the improved version:|Here is the full code:)([\s\S]*?)(?:$|(?=^#))/im);
  if (indentedCodeMatch && indentedCodeMatch[1] && indentedCodeMatch[1].length > 300) {
    return indentedCodeMatch[1].trim();
  }
  
  // Return whatever we got from the standard match, even if it's short
  return standardMatch ? cleanCodeBlocks(standardMatch[1].trim()) : '';
}

/**
 * Parses the raw text from the AI response into structured data
 * With improved robustness for handling incomplete or malformed responses
 */
function parseReviewText(rawText) {
  try {
    // Check if we actually have content to parse
    if (!rawText || rawText.trim().length < 100) {
      return {
        success: false,
        error: 'Response content is too short or empty'
      };
    }
    
    logger.debug(`Parsing review text of length: ${rawText.length}`);
    
    // Initialize the result structure
    const result = new CodeReviewResponse();

    // Extract summary section - use more flexible pattern matching
    const summaryMatch = rawText.match(
      /(?:SUMMARY:|Summary:|summary:|Code Review Summary:|Analysis:|Overview:)([^]*?)(?=SUGGESTIONS:|Suggestions:|suggestions:|CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:|Issues:|Problems:|$)/i
    );
    
    if (summaryMatch && summaryMatch[1] && summaryMatch[1].trim().length > 20) {
      result.summary = summaryMatch[1].trim();
      logger.debug(`Extracted summary of length: ${result.summary.length}`);
    } else {
      // Fallback: Try to extract the first paragraph as summary
      const firstParagraph = rawText.split(/\n\s*\n/)[0];
      if (firstParagraph && firstParagraph.length > 50) {
        result.summary = firstParagraph.trim();
        logger.debug(`Used first paragraph as summary: ${result.summary.length}`);
      } else {
        logger.warn('Failed to extract a meaningful summary section');
        return {
          success: false,
          error: 'Failed to extract summary section from response'
        };
      }
    }

    // Extract suggestions section - more flexible pattern
    const suggestionsText = rawText.match(
      /(?:SUGGESTIONS:|Suggestions:|suggestions:|Issues:|Problems:|Improvements:)([^]*?)(?=CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:|Improved Code:|Complete Code:|Refactored Code:|$)/i
    );
    
    if (suggestionsText && suggestionsText[1]) {
      // Process suggestions by looking for LINE: patterns
      const suggestionBlocks = suggestionsText[1].split(/(?:LINE:|Line:|line:|Issue \d+:|Problem \d+:|#\d+:)\s*(\d+)/i);

      // The split result has format: [preceding text, lineNum, content, lineNum, content, ...]
      // Start from index 1 (first line number) and process in pairs
      
      // Keep track of seen suggestions to deduplicate
      const seenSuggestions = new Map();
      
      for (let i = 1; i < suggestionBlocks.length; i += 2) {
        if (i + 1 >= suggestionBlocks.length) break;
        
        const lineNumber = parseInt(suggestionBlocks[i]);
        const suggestionContent = suggestionBlocks[i + 1];
        
        if (isNaN(lineNumber)) continue; // Skip if line number is not valid
        
        // Extract original code - flexible patterns
        const originalMatch = suggestionContent.match(
          /(?:ORIGINAL:|Original:|original:|Current Code:|Current:|Before:)\s*([^]*?)(?=SUGGESTED:|Suggested:|suggested:|Improved Code:|After:|Proposed:|EXPLANATION:|Explanation:|explanation:|LINE:|Line:|line:|Issue \d+:|Problem \d+:|#\d+:|$)/i
        );
        
        // Extract suggested code - flexible patterns
        const suggestedMatch = suggestionContent.match(
          /(?:SUGGESTED:|Suggested:|suggested:|Improved Code:|After:|Proposed:)\s*([^]*?)(?=EXPLANATION:|Explanation:|explanation:|Reason:|Justification:|Why:|LINE:|Line:|line:|Issue \d+:|Problem \d+:|#\d+:|$)/i
        );
        
        // Extract explanation - flexible patterns
        const explanationMatch = suggestionContent.match(
          /(?:EXPLANATION:|Explanation:|explanation:|Reason:|Justification:|Why:)\s*([^]*?)(?=LINE:|Line:|line:|Issue \d+:|Problem \d+:|#\d+:|$)/i
        );
        
        if (originalMatch && suggestedMatch) {
          const originalCode = cleanCodeBlocks(originalMatch[1].trim());
          const suggestedCode = cleanCodeBlocks(suggestedMatch[1].trim());
          
          // Skip empty or identical suggestions
          if (!originalCode || !suggestedCode || originalCode === suggestedCode) {
            continue;
          }
          
          // Create a unique key based on line number, original code, and suggested code
          // This helps identify duplicate suggestions
          const suggestionKey = `${lineNumber}:${originalCode}:${suggestedCode}`;
          
          // Only add if we haven't seen this exact suggestion before
          if (!seenSuggestions.has(suggestionKey)) {
            seenSuggestions.set(suggestionKey, true);
            
            result.suggestions.push(new CodeSuggestion({
              id: uuid(),
              lineNumber,
              originalCode,
              suggestedCode,
              explanation: explanationMatch ? explanationMatch[1].trim() : '',
              accepted: null
            }));
          }
        }
      }
      
      logger.debug(`Extracted ${result.suggestions.length} unique suggestions`);
    }

    // Extract clean code section - improved with multiple fallback strategies
    result.cleanCode = extractCleanCode(rawText);
    
    // Log clean code extraction result
    if (result.cleanCode) {
      logger.debug(`Extracted clean code of length: ${result.cleanCode.length}`);
    } else {
      logger.warn('Failed to extract clean code section');
    }

    // Validate that we have meaningful content in each section
    if (!result.summary || !result.cleanCode) {
      return {
        success: false,
        error: 'One or more essential sections are empty in the parsed response'
      };
    }
    
    // Additional validation: ensure clean code has substantial content
    if (result.cleanCode.length < 300) {
      logger.warn(`Clean code section is suspiciously short: ${result.cleanCode.length} chars`);
      return {
        success: false,
        error: 'Clean code section is incomplete or too short (less than 300 characters)'
      };
    }

    return {
      success: true,
      result
    };
  } catch (error) {
    logger.error('Error parsing review text:', error);
    return {
      success: false,
      error: error.message || 'Unknown error parsing response'
    };
  }
}

/**
 * Cleans code block markers from text
 */
function removeCodeBlockSyntax(text) {
  return text
    // Remove ```language and ``` markers
    .replace(/```(?:\w*\n|\s*)/g, '')
    // Remove inline code markers
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Attempt to repair a response via regex when the response is not in the expected format
 * Enhanced to better handle incomplete clean code sections
 */
function repairWithRegex(rawText) {
  try {
    // Log the repair attempt
    logger.info(`Attempting to repair a review response of length: ${rawText.length}`);
    
    // More tolerant parsing that tries to extract whatever it can find
    const result = new CodeReviewResponse();

    // Try to find anything that looks like a summary
    const summaryMatch = rawText.match(/(?:.*?review.*?:|.*?summary.*?:|.*?analysis.*?:)([^]*?)(?=\n\n|\n[A-Z]|$)/i);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    } else {
      // If no clear summary marker, use the first paragraph as summary
      const firstParagraph = rawText.split(/\n\s*\n/)[0];
      result.summary = firstParagraph.trim();
    }
    
    logger.debug(`Repair: Extracted summary of length: ${result.summary.length}`);

    // Look for suggestion patterns - any numbered or bulleted list with code
    const suggestionMatches = [...rawText.matchAll(/(?:[-*\d]+[.)]\s*|(?:issue|problem|suggestion)\s*\d+:?\s*)([^]*?)(?=(?:[-*\d]+[.)]\s*|(?:issue|problem|suggestion)\s*\d+:?\s*)|clean\s*code|improved\s*code|fixed\s*code|$)/gi)];
    
    // Keep track of seen suggestions to deduplicate
    const seenSuggestions = new Map();
    
    let suggestionIndex = 0;
    for (const match of suggestionMatches) {
      suggestionIndex++;
      const content = match[1].trim();
      
      // Try to identify code blocks within the suggestion
      const codeBlocks = content.match(/```[^`]*```|`[^`]+`|\b(?:function|class|if|for|while|return)\b[^;{}]*[{;]/g);
      
      if (codeBlocks && codeBlocks.length >= 1) {
        // Very basic extraction - assume first code block is original and second is suggested
        const originalCode = removeCodeBlockSyntax(codeBlocks[0]);
        const suggestedCode = codeBlocks.length > 1 
          ? removeCodeBlockSyntax(codeBlocks[1])
          : originalCode;
          
        // Skip empty suggestions
        if (!originalCode || !suggestedCode) continue;
        
        // Remaining text is the explanation
        const explanation = content
          .replace(new RegExp(codeBlocks.join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
          .replace(/```\w*\n?|```|`/g, '')
          .trim();
          
        // Create a unique key based on original code and suggested code
        const suggestionKey = `${originalCode}:${suggestedCode}`;
        
        // Only add if we haven't seen this exact suggestion before
        if (!seenSuggestions.has(suggestionKey)) {
          seenSuggestions.set(suggestionKey, true);
          
          result.suggestions.push(new CodeSuggestion({
            id: uuid(),
            lineNumber: suggestionIndex, // Use index if we can't determine line number
            originalCode,
            suggestedCode,
            explanation,
            accepted: null
          }));
        }
      }
    }
    
    logger.debug(`Repair: Extracted ${result.suggestions.length} suggestions`);

    // Use the enhanced clean code extraction for repairs too
    result.cleanCode = extractCleanCode(rawText);
    
    if (!result.cleanCode) {
      // Additional fallback methods for repair scenarios
      
      // Try to find any large section of code after "here is the improved code" or similar
      const improvedCodeMatch = rawText.match(/(?:here\s+is\s+the\s+(?:improved|updated|fixed|complete)\s+code|the\s+(?:improved|updated|fixed|complete)\s+code\s+is)(?:\s*:|\s*as\s+follows|\s*-)?([^]*?)$/i);
      
      if (improvedCodeMatch && improvedCodeMatch[1] && improvedCodeMatch[1].length > 300) {
        // Extract code blocks or just use the entire section if no code blocks found
        const codeBlocks = improvedCodeMatch[1].match(/```[\s\S]*?```/g);
        if (codeBlocks && codeBlocks.length > 0) {
          const largestCodeBlock = codeBlocks.reduce((longest, current) => 
            (current.length > longest.length ? current : longest), "");
          result.cleanCode = cleanCodeBlocks(largestCodeBlock);
        } else {
          result.cleanCode = improvedCodeMatch[1].trim();
        }
      } else {
        // Last resort: look for any large code pattern in the last 50% of the text
        const lastHalf = rawText.substring(Math.floor(rawText.length / 2));
        const lastCodeMatch = lastHalf.match(/(?:```[\s\S]*?```|(?:function|class|const|let|var)\s+\w+[\s\S]*?\})/);
        if (lastCodeMatch && lastCodeMatch[0] && lastCodeMatch[0].length > 200) {
          result.cleanCode = cleanCodeBlocks(lastCodeMatch[0]);
        }
      }
    }
    
    logger.debug(`Repair: Extracted clean code of length: ${result.cleanCode?.length || 0}`);

    // Check if we have both summary and clean code
    const success = !!result.summary && !!result.cleanCode && result.cleanCode.length > 300;
    
    return {
      success,
      result,
      error: !success ? 'Could not extract all required sections with sufficient content' : undefined
    };
  } catch (error) {
    logger.error('Error repairing response:', error);
    return {
      success: false,
      error: error.message || 'Unknown error repairing response'
    };
  }
}

module.exports = {
  parseReviewText,
  repairWithRegex,
  extractCleanCode  // Export for testing or direct use
};