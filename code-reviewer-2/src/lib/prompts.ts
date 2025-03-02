
/**
 * Collection of prompts used for interacting with the Gemini API
 */

/**
 * Formats a code review prompt with the provided code
 * @param code - The code to be reviewed
 * @returns A formatted prompt string for code review
 */
export function createCodeReviewPrompt(code: string): string {
    return `
  You are an expert software engineer conducting a code review. Your task is to review the following code based on clean code principles.
  
  Your response MUST strictly follow this exact format:
  
  SUMMARY:
  [Provide a comprehensive analysis of the code quality, identifying major issues and strengths]
  
  SUGGESTIONS:
  LINE: [line number]
  ORIGINAL: [original code]
  SUGGESTED: [suggested improvement]
  EXPLANATION: [detailed explanation of why this change improves the code]
  
  [Repeat the SUGGESTIONS structure for each suggestion, up to 5 most important suggestions]
  
  CLEAN_CODE:
  [Complete improved version of the code that addresses all suggestions]
  
  IMPORTANT GUIDELINES:
  1. Follow the exact formatting with the section headers exactly as shown
  2. Ensure line numbers in suggestions correspond to the original code
  3. Focus on meaningful improvements that follow clean code principles
  4. Be precise in your explanations
  5. The clean code version should be complete and runnable
  
  CODE TO REVIEW:
  ${code}
  `;
  }
  
  /**
   * Creates a prompt to repair malformed AI responses
   * @param rawText - The raw, potentially malformed text from the AI
   * @returns A formatted prompt for repairing the response
   */
  export function createRepairPrompt(rawText: string): string {
    return `
  I received the following code review, but it doesn't follow the required format. 
  Please restructure it into exactly this format:
  
  SUMMARY:
  [overall feedback about the code]
  
  SUGGESTIONS:
  LINE: [line number]
  ORIGINAL: [original code]
  SUGGESTED: [suggested improvement]
  EXPLANATION: [explanation of why this change improves the code]
  
  CLEAN_CODE:
  [complete improved version of the code]
  
  Here is the review text that needs to be reformatted:
  ${rawText}
  
  Make sure to preserve all the technical content while reformatting it to match the required structure exactly.
  `;
  }
  
  /**
   * Types of code review responses
   */
  export enum ResponseSection {
    SUMMARY = "SUMMARY",
    SUGGESTIONS = "SUGGESTIONS",
    CLEAN_CODE = "CLEAN_CODE"
  }
  
  /**
   * Represents a structured code review suggestion
   */
  export interface CodeSuggestion {
    id: string;
    lineNumber: number;
    originalCode: string;
    suggestedCode: string;
    explanation: string;
    accepted: boolean | null;
  }
  
  /**
   * Represents a structured code review response
   */
  export interface CodeReviewResponse {
    summary: string;
    suggestions: CodeSuggestion[];
    cleanCode: string;
  }