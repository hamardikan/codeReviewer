'use strict';

const { nanoid } = require('nanoid');
const { CodeReviewResponse, CodeSuggestion } = require('../models/Review');

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
  
  return text;
}

/**
 * Parses the raw text from the AI response into structured data
 */
function parseReviewText(rawText) {
  try {
    // Initialize the result structure
    const result = new CodeReviewResponse();

    // Extract summary section
    const summaryMatch = rawText.match(
      /(?:SUMMARY:|Summary:|summary:)([^]*?)(?=SUGGESTIONS:|Suggestions:|suggestions:|CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:|$)/i
    );
    
    if (summaryMatch && summaryMatch[1]) {
      result.summary = summaryMatch[1].trim();
    } else {
      return {
        success: false,
        error: 'Failed to extract summary section from response'
      };
    }

    // Extract suggestions section
    const suggestionsText = rawText.match(
      /(?:SUGGESTIONS:|Suggestions:|suggestions:)([^]*?)(?=CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:|$)/i
    );
    
    if (suggestionsText && suggestionsText[1]) {
      // Process suggestions by looking for LINE: patterns
      const suggestionBlocks = suggestionsText[1].split(/(?:LINE:|Line:|line:)\s*(\d+)/i);

      // The split result has format: [preceding text, lineNum, content, lineNum, content, ...]
      // Start from index 1 (first line number) and process in pairs
      
      // Keep track of seen suggestions to deduplicate
      const seenSuggestions = new Map();
      
      for (let i = 1; i < suggestionBlocks.length; i += 2) {
        if (i + 1 >= suggestionBlocks.length) break;
        
        const lineNumber = parseInt(suggestionBlocks[i]);
        const suggestionContent = suggestionBlocks[i + 1];
        
        if (isNaN(lineNumber)) continue; // Skip if line number is not valid
        
        // Extract original code
        const originalMatch = suggestionContent.match(
          /(?:ORIGINAL:|Original:|original:)\s*([^]*?)(?=SUGGESTED:|Suggested:|suggested:|EXPLANATION:|Explanation:|explanation:|LINE:|Line:|line:|$)/i
        );
        
        // Extract suggested code
        const suggestedMatch = suggestionContent.match(
          /(?:SUGGESTED:|Suggested:|suggested:)\s*([^]*?)(?=EXPLANATION:|Explanation:|explanation:|LINE:|Line:|line:|$)/i
        );
        
        // Extract explanation
        const explanationMatch = suggestionContent.match(
          /(?:EXPLANATION:|Explanation:|explanation:)\s*([^]*?)(?=LINE:|Line:|line:|$)/i
        );
        
        if (originalMatch && suggestedMatch) {
          const originalCode = cleanCodeBlocks(originalMatch[1].trim());
          const suggestedCode = cleanCodeBlocks(suggestedMatch[1].trim());
          
          // Create a unique key based on line number, original code, and suggested code
          // This helps identify duplicate suggestions
          const suggestionKey = `${lineNumber}:${originalCode}:${suggestedCode}`;
          
          // Only add if we haven't seen this exact suggestion before
          if (!seenSuggestions.has(suggestionKey)) {
            seenSuggestions.set(suggestionKey, true);
            
            result.suggestions.push(new CodeSuggestion({
              id: nanoid(),
              lineNumber,
              originalCode,
              suggestedCode,
              explanation: explanationMatch ? explanationMatch[1].trim() : '',
              accepted: null
            }));
          }
        }
      }
    }

    // Extract clean code section
    const cleanCodeMatch = rawText.match(
      /(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)([^]*?)$/i
    );
    
    if (cleanCodeMatch && cleanCodeMatch[1]) {
      result.cleanCode = cleanCodeBlocks(cleanCodeMatch[1].trim());
    } else {
      return {
        success: false,
        error: 'Failed to extract clean code section from response'
      };
    }

    // Validate that we have meaningful content in each section
    if (!result.summary || !result.cleanCode) {
      return {
        success: false,
        error: 'One or more sections are empty in the parsed response'
      };
    }

    return {
      success: true,
      result
    };
  } catch (error) {
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
 */
function repairWithRegex(rawText) {
  try {
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
            id: nanoid(),
            lineNumber: suggestionIndex, // Use index if we can't determine line number
            originalCode,
            suggestedCode,
            explanation,
            accepted: null
          }));
        }
      }
    }

    // Look for the clean code section - anything after keywords like "clean code", "fixed code", etc.
    const cleanCodeMatch = rawText.match(/(?:clean\s*code|improved\s*code|fixed\s*code|refactored\s*code|here.*?final\s*code)(?:\s*:|\s*is|\s*-)?([^]*?)$/i);
    
    if (cleanCodeMatch) {
      // Check if there's a code block in the clean code section
      const codeBlock = cleanCodeMatch[1].match(/```[\s\S]*?```/);
      
      if (codeBlock) {
        // Extract the code and remove markdown code block syntax
        result.cleanCode = cleanCodeBlocks(codeBlock[0]);
      } else {
        // If no code block found, just clean the entire section
        result.cleanCode = cleanCodeBlocks(cleanCodeMatch[1].trim());
      }
    } else {
      // If no clean code section found, use the last code block in the text
      const lastCodeBlock = rawText.match(/```[\s\S]*?```(?!.*```)/);
      if (lastCodeBlock) {
        result.cleanCode = cleanCodeBlocks(lastCodeBlock[0]);
      }
    }

    return {
      success: !!result.summary && !!result.cleanCode,
      result,
      error: !result.summary || !result.cleanCode ? 'Could not extract all required sections' : undefined
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error repairing response'
    };
  }
}

module.exports = {
  parseReviewText,
  repairWithRegex
};