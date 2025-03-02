/**
 * Collection of prompts used for interacting with the Gemini API
 */

/**
 * Formats a code review prompt with the provided code
 * @param code - The code to be reviewed
 * @param language - The programming language
 * @returns A formatted prompt string for code review
 */
export function createCodeReviewPrompt(code: string, language = 'javascript'): string {
  return `
You are an expert software engineer conducting a code review. Your task is to review the following ${language.toUpperCase()} code based on clean code principles and best practices specific to ${language}.

Your response MUST strictly follow this exact format:

SUMMARY:
[Provide a comprehensive analysis of the code quality, identifying major issues and strengths. Consider language-specific best practices for ${language}.]

SUGGESTIONS:
LINE: [line number]
ORIGINAL: [original code]
SUGGESTED: [suggested improvement]
EXPLANATION: [detailed explanation of why this change improves the code]

[Repeat the SUGGESTIONS structure for each suggestion, prioritizing the most important issues first]

CLEAN_CODE:
[Complete improved version of the code that addresses all suggestions]

IMPORTANT GUIDELINES:
1. Follow the exact formatting with the section headers exactly as shown
2. Ensure line numbers in suggestions correspond to the original code
3. Focus on meaningful improvements that follow clean code principles for ${language}
4. Be precise in your explanations
5. The clean code version should be complete and runnable
6. Focus on ${language}-specific best practices and conventions
7. Limit your suggestions to a maximum of 10-15 of the most important issues
8. Avoid duplicate suggestions that address the same issue
9. Do not suggest changes for the same line multiple times
10. Focus on substantial improvements rather than minor style issues

CODE TO REVIEW (${language}):
${code}
`;
}

/**
 * Creates a prompt to repair malformed AI responses
 * @param rawText - The raw, potentially malformed text from the AI
 * @param language - The programming language
 * @returns A formatted prompt for repairing the response
 */
export function createRepairPrompt(rawText: string, language = 'javascript'): string {
  return `
I received the following ${language} code review, but it doesn't follow the required format. 
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

IMPORTANT GUIDELINES:
1. Follow the exact formatting with the section headers exactly as shown
2. Make sure to preserve all the technical content while reformatting it
3. Limit to a maximum of 10-15 suggestions, focusing on the most important ones
4. Do not include duplicate suggestions that address the same issue
5. Ensure all code sections are properly formatted with correct indentation
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