import { nanoid } from 'nanoid';
import { CodeReviewResponse} from './prompts';

/**
 * Result of the parsing operation
 */
interface ParseResult {
  success: boolean;
  result?: CodeReviewResponse;
  error?: string;
}

/**
 * Parses the raw text from the AI response into structured data
 * @param rawText - The raw text from the AI response
 * @returns A parse result with the structured data or error
 */
export function parseReviewText(rawText: string): ParseResult {
  try {
    // Initialize the result structure
    const result: CodeReviewResponse = {
      summary: '',
      suggestions: [],
      cleanCode: ''
    };

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
      const seenSuggestions = new Map<string, boolean>();
      
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
          const originalCode = originalMatch[1].trim();
          const suggestedCode = suggestedMatch[1].trim();
          
          // Create a unique key based on line number, original code, and suggested code
          // This helps identify duplicate suggestions
          const suggestionKey = `${lineNumber}:${originalCode}:${suggestedCode}`;
          
          // Only add if we haven't seen this exact suggestion before
          if (!seenSuggestions.has(suggestionKey)) {
            seenSuggestions.set(suggestionKey, true);
            
            result.suggestions.push({
              id: nanoid(),
              lineNumber,
              originalCode,
              suggestedCode,
              explanation: explanationMatch ? explanationMatch[1].trim() : '',
              accepted: null
            });
          }
        }
      }
    }

    // Extract clean code section
    const cleanCodeMatch = rawText.match(
      /(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)([^]*?)$/i
    );
    
    if (cleanCodeMatch && cleanCodeMatch[1]) {
      result.cleanCode = cleanCodeMatch[1].trim();
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
      error: error instanceof Error ? error.message : 'Unknown error parsing response'
    };
  }
}

/**
 * Attempt to repair a response via regex when the Gemini response is not in the expected format
 * @param rawText - The raw text to repair
 * @returns A parse result with the repaired data or error
 */
export function repairWithRegex(rawText: string): ParseResult {
  try {
    // More tolerant parsing that tries to extract whatever it can find
    const result: CodeReviewResponse = {
      summary: '',
      suggestions: [],
      cleanCode: ''
    };

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
    const seenSuggestions = new Map<string, boolean>();
    
    let suggestionIndex = 0;
    for (const match of suggestionMatches) {
      suggestionIndex++;
      const content = match[1].trim();
      
      // Try to identify code blocks within the suggestion
      const codeBlocks = content.match(/```[^`]*```|`[^`]+`|\b(?:function|class|if|for|while|return)\b[^;{}]*[{;]/g);
      
      if (codeBlocks && codeBlocks.length >= 1) {
        // Very basic extraction - assume first code block is original and second is suggested
        const originalCode = codeBlocks[0].replace(/```\w*\n?|```|`/g, '').trim();
        const suggestedCode = codeBlocks.length > 1 
          ? codeBlocks[1].replace(/```\w*\n?|```|`/g, '').trim() 
          : originalCode;
          
        // Remaining text is the explanation
        const explanation = content
          .replace(codeBlocks.join(''), '')
          .replace(/```\w*\n?|```|`/g, '')
          .trim();
          
        // Create a unique key based on original code and suggested code
        const suggestionKey = `${originalCode}:${suggestedCode}`;
        
        // Only add if we haven't seen this exact suggestion before
        if (!seenSuggestions.has(suggestionKey)) {
          seenSuggestions.set(suggestionKey, true);
          
          result.suggestions.push({
            id: nanoid(),
            lineNumber: suggestionIndex, // Use index if we can't determine line number
            originalCode,
            suggestedCode,
            explanation,
            accepted: null
          });
        }
      }
    }

    // Look for the clean code section - anything after keywords like "clean code", "fixed code", etc.
    const cleanCodeMatch = rawText.match(/(?:clean\s*code|improved\s*code|fixed\s*code|refactored\s*code|here.*?final\s*code)(?:\s*:|\s*is|\s*-)?([^]*?)$/i);
    if (cleanCodeMatch) {
      // Extract the code block if it exists
      const codeBlock = cleanCodeMatch[1].match(/```[^`]*```/);
      result.cleanCode = codeBlock 
        ? codeBlock[0].replace(/```\w*\n?|```/g, '').trim()
        : cleanCodeMatch[1].trim();
    } else {
      // If no clean code section found, use the last code block in the text
      const lastCodeBlock = rawText.match(/```[^`]*```(?!.*```)/);
      if (lastCodeBlock) {
        result.cleanCode = lastCodeBlock[0].replace(/```\w*\n?|```/g, '').trim();
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
      error: error instanceof Error ? error.message : 'Unknown error repairing response'
    };
  }
}