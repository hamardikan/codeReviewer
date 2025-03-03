'use strict';

/**
 * Creates a prompt for code reviews
 * Enhanced to emphasize the importance of complete clean code
 */
function createCodeReviewPrompt(code, language = 'javascript') {
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
[Complete improved version of the code that addresses all suggestions. This section MUST include the ENTIRE code, not just the changes. The clean code should be completely functional and include ALL original functionality with improvements.]

IMPORTANT GUIDELINES:
1. Follow the exact formatting with the section headers exactly as shown
2. Ensure line numbers in suggestions correspond to the original code
3. Focus on meaningful improvements that follow clean code principles for ${language}
4. Be precise in your explanations
5. THE CLEAN CODE SECTION MUST BE COMPLETE AND INCLUDE THE ENTIRE CODEBASE with all improvements integrated
6. Focus on ${language}-specific best practices and conventions
7. Limit your suggestions to a maximum of 10-15 of the most important issues
8. Avoid duplicate suggestions that address the same issue
9. Do not suggest changes for the same line multiple times
10. Focus on substantial improvements rather than minor style issues
11. Do not truncate or abbreviate any part of the clean code - it must be complete and runnable

CODE TO REVIEW (${language}):
${code}
`;
}

/**
 * Creates a prompt for repairing malformed responses
 * Enhanced to emphasize the importance of complete clean code
 */
function createRepairPrompt(rawText, language = 'javascript') {
  return `
I received the following ${language} code review, but it doesn't follow the required format or the clean code section is incomplete. 
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
6. THE CLEAN CODE SECTION MUST BE COMPLETE AND INCLUDE THE ENTIRE CODEBASE with all improvements integrated
7. If the clean code section in the original response is incomplete, please reconstruct it by implementing all the suggestions on the original code
8. Do not truncate or abbreviate any part of the clean code - it must be complete and runnable
9. The clean code section should be the highest priority - ensure it's complete and properly formatted
`;
}

module.exports = {
  createCodeReviewPrompt,
  createRepairPrompt
};