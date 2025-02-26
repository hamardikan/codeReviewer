/**
 * Enhanced Gemini API integration for code review service.
 * Provides structured code analysis based on Clean Code principles with a focus on
 * saving senior engineers' review time.
 */
import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    GenerativeModel,
    ChatSession,
  } from "@google/generative-ai";
  
  // Review response type definition with expanded properties
  export interface CodeReviewResponse {
    summary: string;
    issues: Array<{
      type: string;
      description: string;
      lineNumbers?: number[];
      severity: 'critical' | 'high' | 'medium' | 'low';
      impact: string; // How this issue impacts code quality/maintainability
    }>;
    suggestions: Array<{
      description: string;
      before: string;
      after: string;
      benefits: string; // Benefits of implementing this change
    }>;
    improvedCode: string;
    learningResources?: Array<{
      topic: string;
      description: string;
    }>;
    seniorReviewTime?: { // Estimated time saved for senior reviewers
      before: string, // e.g., "15 minutes"
      after: string, // e.g., "5 minutes"
      timeSaved: string // e.g., "10 minutes"
    };
  }
  
  /**
   * Initializes and configures the Gemini API client.
   * @returns Configured Gemini API client
   */
  export function initGeminiApi(): { model: GenerativeModel } {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-thinking-exp-01-21",
      generationConfig: {
        temperature: 0.4, // Lower temperature for more consistent reviews
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 65536,
        responseMimeType: "text/plain",
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });
    
    return { model };
  }
  
  /**
   * Creates a prompt for the Gemini model to analyze code based on Clean Code principles.
   * @param code - Code to be reviewed
   * @param language - Programming language of the code
   * @param reviewFocus - Optional focus areas for the review
   * @returns Formatted prompt for code review
   */
  function createCodeReviewPrompt(
    code: string, 
    language: string, 
    reviewFocus?: {
      cleanCode?: boolean,
      performance?: boolean,
      security?: boolean
    }
  ): string {
    const focusAreas = [];
    
    if (!reviewFocus || reviewFocus.cleanCode) {
      focusAreas.push(
        "Function and variable naming",
        "Code organization and structure",
        "Function length and complexity",
        "Error handling approach",
        "Consistency in style and patterns",
        "Code duplication and reusability"
      );
    }
    
    if (reviewFocus?.performance) {
      focusAreas.push(
        "Algorithm efficiency",
        "Resource usage optimization",
        "Unnecessary computations",
        "Performance bottlenecks"
      );
    }
    
    if (reviewFocus?.security) {
      focusAreas.push(
        "Input validation",
        "Authentication/authorization issues",
        "Data exposure risks",
        "Common security vulnerabilities"
      );
    }
  
    return `
  You are an expert senior software engineer conducting a code review for a junior developer. Your mission is to provide a comprehensive review that will:
  1. Identify issues that would typically require senior engineer time to catch
  2. Explain problems clearly in a way junior engineers can understand and learn from
  3. Provide specific, actionable improvements with before/after code examples
  
  REVIEW THIS ${language.toUpperCase()} CODE:
  \`\`\`${language}
  ${code}
  \`\`\`
  
  You must respond with a JSON object that follows this EXACT structure:
  {
    "summary": "Brief overview of code quality, highlighting the 2-3 most important issues",
    "issues": [
      {
        "type": "naming|complexity|duplication|readability|structure|performance|security",
        "description": "Clear explanation of the issue with rationale for why it matters",
        "lineNumbers": [Array of line numbers where this occurs],
        "severity": "critical|high|medium|low",
        "impact": "How this issue affects code quality, maintainability, or team productivity"
      }
    ],
    "suggestions": [
      {
        "description": "Specific, actionable recommendation",
        "before": "Code snippet showing the issue (keep it focused and short)",
        "after": "Improved code implementation",
        "benefits": "Concrete benefits of making this change"
      }
    ],
    "improvedCode": "Complete revised version of the code with ALL suggested improvements applied",
    "learningResources": [
      {
        "topic": "Specific clean code principle or pattern relevant to this review",
        "description": "Brief explanation of why learning this would benefit the developer"
      }
    ],
    "seniorReviewTime": {
      "before": "Estimated time a senior would spend reviewing the original code",
      "after": "Estimated time to review if issues were fixed",
      "timeSaved": "Difference between before and after"
    }
  }
  
  Focus specifically on these areas that senior engineers typically catch during reviews:
  ${focusAreas.map(area => `- ${area}`).join('\n')}
  
  IMPORTANT GUIDELINES:
  1. Be specific and concrete - avoid vague suggestions
  2. Prioritize issues by importance - focus on what would save the most senior engineer time
  3. Keep code examples minimal but complete enough to demonstrate the point
  4. Assume the junior developer is motivated but needs clear guidance
  5. For the improved code, make ALL suggested changes so it represents a complete solution
  6. Ensure the response is valid JSON with proper escaping of quotes and special characters
  
  The primary goal is to SAVE SENIOR ENGINEERS' TIME by catching issues early and providing clear guidance for junior developers.
  `;
  }
  
  /**
   * Validates that the review response meets quality standards.
   * @param response - The review response to validate
   * @returns Boolean indicating if the response meets quality standards
   */
  function validateReviewQuality(response: CodeReviewResponse): boolean {
    // Check if the response has all required fields
    if (!response.summary || !Array.isArray(response.issues) || 
        !Array.isArray(response.suggestions) || !response.improvedCode) {
      return false;
    }
    
    // Check if the response has at least one issue and suggestion
    if (response.issues.length === 0 || response.suggestions.length === 0) {
      return false;
    }
    
    // Check if the improved code is different from the original
    if (response.improvedCode.trim().length === 0) {
      return false;
    }
    
    // Check if issues have required fields
    for (const issue of response.issues) {
      if (!issue.type || !issue.description || !issue.severity) {
        return false;
      }
    }
    
    // Check if suggestions have required fields
    for (const suggestion of response.suggestions) {
      if (!suggestion.description || suggestion.before === undefined || 
          suggestion.after === undefined) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Parses the Gemini API response, handling various response formats.
   * @param responseText - Raw text response from Gemini API
   * @returns Parsed CodeReviewResponse object
   */
  function parseReviewResponse(responseText: string): CodeReviewResponse {
    try {
      // First attempt: try to parse the entire response as JSON
      return JSON.parse(responseText);
    } catch {
      // Second attempt: look for JSON object in the response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (nestedError) {
        console.error('Error parsing JSON from matched pattern:', nestedError);
      }
      
      // If all parsing attempts fail, throw an error
      throw new Error('Failed to parse valid JSON from the API response');
    }
  }
  
  /**
   * Sends code to Gemini API for review and returns structured feedback.
   * @param code - Code to be reviewed
   * @param language - Programming language of the code
   * @param reviewFocus - Optional focus areas for the review
   * @returns Structured code review response
   */
  export async function reviewCode(
    code: string, 
    language: string,
    reviewFocus?: {
      cleanCode?: boolean,
      performance?: boolean,
      security?: boolean
    }
  ): Promise<CodeReviewResponse> {
    const { model } = initGeminiApi();
    const prompt = createCodeReviewPrompt(code, language, reviewFocus);
    
    try {
      const chatSession = model.startChat({
        history: [],
      });
      
      const result = await chatSession.sendMessage(prompt);
      const responseText = result.response.text();
      
      try {
        // Parse the response
        const response = parseReviewResponse(responseText);
        
        // Validate the quality of the review
        if (!validateReviewQuality(response)) {
          // If quality check fails, try again with more specific instructions
          return await retryReview(chatSession, code);
        }
        
        return response;
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        return await retryReview(chatSession, code);
      }
    } catch (apiError) {
      console.error('Error calling Gemini API:', apiError);
      throw new Error('Failed to get code review from Gemini API');
    }
  }
  
  /**
   * Retries the code review with more explicit formatting instructions.
   * @param chatSession - Active chat session
   * @param code - Code to be reviewed
   * @returns Structured code review response
   */
  async function retryReview(
    chatSession: ChatSession, 
    code: string
  ): Promise<CodeReviewResponse> {
    const retryPrompt = `
  Your previous response couldn't be properly parsed as JSON. Please review the code again and respond ONLY with a valid JSON object.
  
  The response must be a VALID JSON object with this structure:
  {
    "summary": "string",
    "issues": [
      {
        "type": "string",
        "description": "string",
        "lineNumbers": [number],
        "severity": "critical|high|medium|low",
        "impact": "string"
      }
    ],
    "suggestions": [
      {
        "description": "string",
        "before": "string",
        "after": "string",
        "benefits": "string"
      }
    ],
    "improvedCode": "string",
    "learningResources": [
      {
        "topic": "string",
        "description": "string"
      }
    ],
    "seniorReviewTime": {
      "before": "string",
      "after": "string",
      "timeSaved": "string"
    }
  }
  
  IMPORTANT RULES:
  1. Respond ONLY with valid JSON
  2. Ensure all string values with quotes or special characters are properly escaped
  3. The JSON must be properly formatted with no trailing commas or syntax errors
  4. DO NOT include any markdown formatting, only pure JSON
  `;
  
    try {
      const result = await chatSession.sendMessage(retryPrompt);
      const responseText = result.response.text();
      
      try {
        return parseReviewResponse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON in retry response:', parseError);
        
        // One more attempt with even stricter instructions
        return await lastChanceReview(chatSession, code);
      }
    } catch (retryError) {
      console.error('Error in retry review:', retryError);
      return createFallbackResponse(code);
    }
  }
  
  /**
   * Last attempt to get a valid JSON response from the model.
   * @param chatSession - Active chat session
   * @param code - Original code being reviewed
   * @returns Structured code review response
   */
  async function lastChanceReview(chatSession: ChatSession, code: string): Promise<CodeReviewResponse> {
    const finalAttemptPrompt = `
  I'm still unable to parse your response as valid JSON. Please respond with ONLY the following minimal JSON structure:
  
  {
    "summary": "Brief review of code quality",
    "issues": [
      {
        "type": "readability",
        "description": "Issue description",
        "severity": "medium",
        "impact": "Impact description"
      }
    ],
    "suggestions": [
      {
        "description": "Suggestion description",
        "before": "Code before",
        "after": "Code after",
        "benefits": "Benefits description"
      }
    ],
    "improvedCode": "The full improved code"
  }
  
  Double-check that your response contains ONLY this JSON object with no additional text, markdown formatting, or explanations.
  `;
  
    try {
      const result = await chatSession.sendMessage(finalAttemptPrompt);
      const responseText = result.response.text();
      
      try {
        return parseReviewResponse(responseText);
      } catch (finalError) {
        console.error('Final attempt failed to parse JSON:', finalError);
        return createFallbackResponse(code);
      }
    } catch (lastAttemptError) {
      console.error('Error in final review attempt:', lastAttemptError);
      return createFallbackResponse(code);
    }
  }
  
  /**
   * Creates a fallback response when all attempts to get a valid review fail.
   * @param code - Original code being reviewed
   * @returns Basic code review response
   */
  function createFallbackResponse(code: string): CodeReviewResponse {
    return {
      summary: "We encountered an issue generating a detailed code review. Here are some general suggestions for improving code quality.",
      issues: [{
        type: "general",
        description: "Unable to analyze specific issues in the provided code",
        severity: "medium",
        impact: "Consider reviewing the code manually for common clean code issues"
      }],
      suggestions: [{
        description: "Consider using a linter or style guide to enforce consistent coding practices",
        before: "",
        after: "",
        benefits: "Linters can automatically catch common issues and enforce team standards"
      }],
      improvedCode: code,
      learningResources: [
        {
          topic: "Clean Code Principles",
          description: "Reading 'Clean Code' by Robert C. Martin can help establish good coding practices"
        }
      ],
      seniorReviewTime: {
        before: "Unknown",
        after: "Unknown",
        timeSaved: "Unable to estimate"
      }
    };
  }