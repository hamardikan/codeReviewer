/**
 * Enhanced Gemini API integration for two-phase code review service.
 * Phase 1: Detection - Identify issues based on Clean Code principles
 * Phase 2: Implementation - Apply approved changes
 */
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  ChatSession,
} from "@google/generative-ai";
import { CodeChunk } from "./chunker";

// Issue detection response type
export interface CodeIssueDetectionResponse {
  summary: string;
  issues: Array<{
    id: string; // Unique identifier for tracking user selection
    type: string;
    description: string;
    lineNumbers?: number[];
    severity: 'critical' | 'high' | 'medium' | 'low';
    impact: string;
    proposedSolution: string; // Brief description of how it could be fixed
    approved?: boolean; // For senior developer selection
    seniorComments?: string; // For senior developer feedback
  }>;
  codeQualityScore?: {
    overall: number; // 0-100 score
    categories: {
      readability: number;
      maintainability: number;
      simplicity: number;
      consistency: number;
    };
  };
  // Tracking for chunked processing
  chunkMetadata?: {
    chunkId: string;
    isPartialReview: boolean;
    originalLineStart: number;
    originalLineEnd: number;
  };
}

// Implementation response with changes based on approved issues
export interface CodeImplementationResponse {
  summary: string;
  appliedChanges: Array<{
    issueId: string; // References the issue from detection phase
    description: string;
    before: string;
    after: string;
    benefits: string;
  }>;
  improvedCode: string;
  learningResources?: Array<{
    topic: string;
    description: string;
  }>;
  seniorReviewTime?: {
    before: string,
    after: string,
    timeSaved: string
  };
  chunkMetadata?: {
    chunkId: string;
    isPartialReview: boolean;
    originalLineStart: number;
    originalLineEnd: number;
  };
}

// Combined response type for backward compatibility
export interface CodeReviewResponse {
  phase: 'detection' | 'implementation' | 'complete';
  summary: string;
  issues: Array<{
    id: string;
    type: string;
    description: string;
    lineNumbers?: number[];
    severity: 'critical' | 'high' | 'medium' | 'low';
    impact: string;
    approved?: boolean;
    seniorComments?: string;
  }>;
  suggestions: Array<{
    description: string;
    before: string;
    after: string;
    benefits: string;
  }>;
  improvedCode: string;
  learningResources?: Array<{
    topic: string;
    description: string;
  }>;
  seniorReviewTime?: {
    before: string,
    after: string,
    timeSaved: string
  };
  chunkMetadata?: {
    chunkId: string;
    isPartialReview: boolean;
    originalLineStart: number;
    originalLineEnd: number;
  };
  codeQualityScore?: {
    overall: number;
    categories: {
      readability: number;
      maintainability: number;
      simplicity: number;
      consistency: number;
    };
  };
}

// Options for code review
export interface CodeReviewOptions {
  reviewFocus?: {
    cleanCode?: boolean;
    performance?: boolean;
    security?: boolean;
  };
  maxRetries?: number;
  chunkContext?: string;
  isPartialReview?: boolean;
  approvedIssues?: string[]; // IDs of issues approved for fixing
  seniorFeedback?: Record<string, string>; // Senior comments keyed by issue ID
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
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.4,
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
 * Creates a prompt for the Gemini model to detect code issues based on Clean Code principles.
 * Focused only on identifying problems, not implementing solutions.
 */
function createIssueDetectionPrompt(
  code: string, 
  language: string, 
  options: CodeReviewOptions = {}
): string {
  const { reviewFocus, chunkContext, isPartialReview } = options;
  const focusAreas = [];
  
  if (!reviewFocus || reviewFocus.cleanCode) {
    focusAreas.push(
      "Function and variable naming (using descriptive, intention-revealing names)",
      "Code organization and structure (cohesive classes, appropriate abstractions)",
      "Function length and complexity (short, focused functions that do one thing)",
      "Error handling approach (consistent, graceful error handling)",
      "Consistency in style and patterns (following established conventions)",
      "Code duplication and DRY principle violations (avoiding repeated logic)",
      "Hard-coded values (replacing with named constants)",
      "Nested conditionals (encapsulating complex logic in separate functions)",
      "Comment quality (avoiding unnecessary comments, focusing on 'why' not 'what')",
      "Appropriate use of language features and idioms"
    );
  }
    
  if (reviewFocus?.performance) {
    focusAreas.push(
      "Algorithm efficiency and Big O complexity",
      "Resource usage optimization (memory, CPU, network, etc.)",
      "Unnecessary computations or operations",
      "Performance bottlenecks and hot paths",
      "Data structure selection and usage",
      "Caching and memoization opportunities",
      "Asynchronous and parallel processing options",
      "Lazy loading and initialization potential"
    );
  }
    
  if (reviewFocus?.security) {
    focusAreas.push(
      "Input validation and sanitization",
      "Authentication and authorization issues",
      "Data exposure risks and sensitive information handling",
      "Common security vulnerabilities (XSS, CSRF, injection attacks, etc.)",
      "Secure communication and data transfer",
      "Proper error handling without leaking sensitive information",
      "Secure storage of credentials and secrets",
      "Principle of least privilege application"
    );
  }

  // Add instructions for chunk-specific processing
  let chunkInstructions = '';
  if (isPartialReview) {
    chunkInstructions = `
IMPORTANT: You are reviewing a CHUNK of code that's part of a larger codebase. Consider the following:
1. This is not the complete file, so focus on issues within this chunk.
2. Some dependencies or context may be in other parts of the codebase.
3. Keep line number references relative to this chunk (starting at line 1).
4. Focus on providing a self-contained review for this specific chunk.

${chunkContext ? `CHUNK CONTEXT: ${chunkContext}\n` : ''}`;
  }

  return `
You are an expert senior software engineer conducting the FIRST PHASE of a two-phase code review for a junior developer.
In this phase, your ONLY job is to DETECT issues and violations of clean code principles, NOT to fix them.

Your detection will be reviewed by a senior developer who will decide which issues should be fixed in phase two.

${chunkInstructions}

REVIEW THIS ${language.toUpperCase()} CODE:
\`\`\`${language}
${code}
\`\`\`

You must respond with a JSON object that follows this EXACT structure:
{
  "summary": "Brief overview of code quality, highlighting the 2-3 most important issues",
  "issues": [
    {
      "id": "unique-identifier-for-this-issue",
      "type": "naming|complexity|duplication|readability|structure|performance|security",
      "description": "Clear explanation of the issue with rationale for why it matters",
      "lineNumbers": [Array of line numbers where this occurs],
      "severity": "critical|high|medium|low",
      "impact": "How this issue affects code quality, maintainability, or team productivity",
      "proposedSolution": "Brief description of how this could be fixed (but don't implement it yet)"
    }
  ],
  "codeQualityScore": {
    "overall": 85, // 0-100 score
    "categories": {
      "readability": 80,
      "maintainability": 85,
      "simplicity": 70,
      "consistency": 90
    }
  }
}

Focus specifically on these areas that senior engineers typically catch during reviews:
${focusAreas.map(area => `- ${area}`).join('\n')}

IMPORTANT GUIDELINES:
1. ONLY identify issues - do NOT provide fixed code in this phase
2. Be specific and concrete about each issue
3. Prioritize issues by severity and impact
4. Make sure all issues have clear "proposedSolution" fields explaining how they could be fixed
5. Generate a unique ID for each issue so the senior developer can reference them
6. Grade the overall code quality as well as specific categories
7. Ensure the response is valid JSON with proper escaping of quotes and special characters

The primary goal is to IDENTIFY issues that a senior developer should review before approving fixes.
`;
}

/**
 * Creates a prompt for implementing approved changes based on senior developer selections.
 */
function createImplementationPrompt(
  code: string,
  language: string,
  detectionResult: CodeIssueDetectionResponse,
  options: CodeReviewOptions = {}
): string {
  const { approvedIssues, seniorFeedback, chunkContext, isPartialReview } = options;
  
  // Filter for approved issues
  const issues = detectionResult.issues.filter(issue => 
    approvedIssues?.includes(issue.id) || issue.approved
  );
  
  // Create a list of issues with senior feedback
  const issuesWithFeedback = issues.map(issue => {
    const feedback = seniorFeedback?.[issue.id] || '';
    return {
      ...issue,
      seniorFeedback: feedback ? `Senior feedback: ${feedback}` : ''
    };
  });
  
  // Add instructions for chunk-specific processing
  let chunkInstructions = '';
  if (isPartialReview) {
    chunkInstructions = `
IMPORTANT: You are reviewing a CHUNK of code that's part of a larger codebase. Consider the following:
1. This is not the complete file, so focus on issues within this chunk.
2. Some dependencies or context may be in other parts of the codebase.
3. Keep line number references relative to this chunk (starting at line 1).
4. Focus on providing a self-contained review for this specific chunk.

${chunkContext ? `CHUNK CONTEXT: ${chunkContext}\n` : ''}`;
  }

  return `
You are an expert senior software engineer conducting the SECOND PHASE of a two-phase code review.
In this phase, your job is to implement fixes for ONLY the issues that have been approved by a senior developer.

${chunkInstructions}

ORIGINAL CODE:
\`\`\`${language}
${code}
\`\`\`

APPROVED ISSUES TO FIX:
${JSON.stringify(issuesWithFeedback, null, 2)}

You must respond with a JSON object that follows this EXACT structure:
{
  "summary": "Brief overview of the changes made",
  "appliedChanges": [
    {
      "issueId": "id-from-the-detection-phase",
      "description": "What was fixed and how",
      "before": "Code snippet showing the original problematic code",
      "after": "Code snippet showing the improved implementation",
      "benefits": "The specific benefits of this change"
    }
  ],
  "improvedCode": "The complete revised code with ALL approved changes applied",
  "learningResources": [
    {
      "topic": "Specific clean code principle or pattern relevant to this review",
      "description": "Brief explanation of why learning this would benefit the developer"
    }
  ],
  "seniorReviewTime": {
    "before": "Estimated time a senior would spend reviewing the original code",
    "after": "Estimated time to review the improved code",
    "timeSaved": "Difference between before and after"
  }
}

IMPORTANT GUIDELINES:
1. ONLY implement fixes for the issues that were explicitly approved in the list
2. Follow any specific feedback provided by the senior developer
3. Make surgical changes - don't modify code unrelated to the approved issues
4. Ensure the complete improved code is included and functional
5. Respect the original style and approach where possible
6. Ensure the response is valid JSON with proper escaping of quotes and special characters

The primary goal is to implement high-quality fixes that directly address the approved issues.
`;
}

/**
 * Validates that the issue detection response meets quality standards.
 */
function validateDetectionQuality(response: CodeIssueDetectionResponse): boolean {
  // Check if the response has all required fields
  if (!response.summary || !Array.isArray(response.issues)) {
    return false;
  }
  
  // Check if the response has at least one issue
  if (response.issues.length === 0) {
    return false;
  }
  
  // Check if issues have required fields
  for (const issue of response.issues) {
    if (!issue.id || !issue.type || !issue.description || !issue.severity || !issue.proposedSolution) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates that the implementation response meets quality standards.
 */
function validateImplementationQuality(response: CodeImplementationResponse): boolean {
  // Check if the response has all required fields
  if (!response.summary || !Array.isArray(response.appliedChanges) || !response.improvedCode) {
    return false;
  }
  
  // Check if the response has at least one applied change
  if (response.appliedChanges.length === 0) {
    return false;
  }
  
  // Check if applied changes have required fields
  for (const change of response.appliedChanges) {
    if (!change.issueId || !change.description || change.before === undefined || change.after === undefined) {
      return false;
    }
  }
  
  // Check if the improved code is different from the original
  if (response.improvedCode.trim().length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Parses the Gemini API response for the detection phase.
 * Enhanced with better JSON extraction and error handling.
 */
function parseDetectionResponse(responseText: string): CodeIssueDetectionResponse {
  try {
    // First attempt: try to parse the entire response as JSON
    return JSON.parse(responseText);
  } catch {
    // Second attempt: look for JSON object in the response
    try {
      // Find the JSON object using a more robust regex pattern
      const jsonMatch = responseText.match(/(\{[\s\S]*\})/g);
      if (jsonMatch) {
        // Try each match (in case there are multiple JSON-like structures)
        for (const match of jsonMatch) {
          try {
            return JSON.parse(match);
          } catch {
            // Continue to next match
          }
        }
      }
      
      // Third attempt: try to find JSON with relaxed regex
      const relaxedMatch = responseText.match(/\{[\s\S]*"summary"[\s\S]*"issues"[\s\S]*\}/);
      if (relaxedMatch) {
        try {
          return JSON.parse(relaxedMatch[0]);
        } catch {
          // Continue to more aggressive parsing
        }
      }
      
      // Fourth attempt: aggressive JSON repair for detection response
      return repairAndParseDetectionJSON(responseText);
    } catch (nestedError) {
      console.error('Error parsing JSON from matched pattern:', nestedError);
      throw new Error('Failed to parse valid JSON from the API response');
    }
  }
}

/**
 * Parses the Gemini API response for the implementation phase.
 */
function parseImplementationResponse(responseText: string): CodeImplementationResponse {
  try {
    // First attempt: try to parse the entire response as JSON
    return JSON.parse(responseText);
  } catch {
    // Second attempt: look for JSON object in the response
    try {
      // Find the JSON object using a more robust regex pattern
      const jsonMatch = responseText.match(/(\{[\s\S]*\})/g);
      if (jsonMatch) {
        // Try each match (in case there are multiple JSON-like structures)
        for (const match of jsonMatch) {
          try {
            return JSON.parse(match);
          } catch {
            // Continue to next match
          }
        }
      }
      
      // Third attempt: try to find JSON with relaxed regex
      const relaxedMatch = responseText.match(/\{[\s\S]*"summary"[\s\S]*"appliedChanges"[\s\S]*\}/);
      if (relaxedMatch) {
        try {
          return JSON.parse(relaxedMatch[0]);
        } catch {
          // Continue to more aggressive parsing
        }
      }
      
      // Fourth attempt: aggressive JSON repair for implementation response
      return repairAndParseImplementationJSON(responseText);
    } catch (nestedError) {
      console.error('Error parsing JSON from matched pattern:', nestedError);
      throw new Error('Failed to parse valid JSON from the API response');
    }
  }
}

/**
 * Attempts to repair and parse malformed JSON in the detection API response
 */
function repairAndParseDetectionJSON(text: string): CodeIssueDetectionResponse {
  // Extract key components that should be in the response
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]*)"/);
  const summary = summaryMatch ? summaryMatch[1] : "Unable to parse summary";
  
  // Create a minimal valid response
  const fallbackResponse: CodeIssueDetectionResponse = {
    summary,
    issues: [{
      id: "parsing-error-1",
      type: "parsing",
      description: "The AI generated a response that couldn't be fully parsed.",
      severity: "medium",
      impact: "Please review the suggestions manually.",
      proposedSolution: "Try running the detection again or check the format."
    }]
  };
  
  // Try to extract issues array
  try {
    const issuesMatch = text.match(/"issues"\s*:\s*(\[[\s\S]*?\])/);
    if (issuesMatch) {
      const issuesJson = issuesMatch[1].replace(/'/g, '"');
      const issues = JSON.parse(issuesJson);
      if (Array.isArray(issues)) {
        fallbackResponse.issues = issues;
      }
    }
  } catch {
    // Keep default issues
  }
  
  return fallbackResponse;
}

/**
 * Attempts to repair and parse malformed JSON in the implementation API response
 */
function repairAndParseImplementationJSON(text: string): CodeImplementationResponse {
  // Extract key components that should be in the response
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]*)"/);
  const summary = summaryMatch ? summaryMatch[1] : "Unable to parse summary";
  
  // Create a minimal valid response
  const fallbackResponse: CodeImplementationResponse = {
    summary,
    appliedChanges: [{
      issueId: "parsing-error-1",
      description: "The AI generated a response that couldn't be fully parsed.",
      before: "Error parsing response",
      after: "Error parsing response",
      benefits: "None - parsing error occurred"
    }],
    improvedCode: "" // Will be filled with original code by caller
  };
  
  // Try to extract applied changes array
  try {
    const appliedChangesMatch = text.match(/"appliedChanges"\s*:\s*(\[[\s\S]*?\])/);
    if (appliedChangesMatch) {
      const changesJson = appliedChangesMatch[1].replace(/'/g, '"');
      const changes = JSON.parse(changesJson);
      if (Array.isArray(changes)) {
        fallbackResponse.appliedChanges = changes;
      }
    }
  } catch {
    // Keep default applied changes
  }
  
  // Try to extract improved code
  try {
    const codeMatch = text.match(/"improvedCode"\s*:\s*"([\s\S]*?)"\s*,\s*"(learningResources|seniorReviewTime)/);
    if (codeMatch) {
      let improvedCode = codeMatch[1];
      // Unescape any escaped quotes
      improvedCode = improvedCode.replace(/\\"/g, '"');
      // Unescape any escaped newlines
      improvedCode = improvedCode.replace(/\\n/g, '\n');
      fallbackResponse.improvedCode = improvedCode;
    }
  } catch {
    // Keep empty improved code
  }
  
  return fallbackResponse;
}

/**
 * First phase: Detects code issues without implementing changes.
 * Returns structured feedback about potential problems.
 */
export async function detectCodeIssues(
  code: string, 
  language: string,
  options: CodeReviewOptions = {}
): Promise<CodeIssueDetectionResponse> {
  const { model } = initGeminiApi();
  const prompt = createIssueDetectionPrompt(code, language, options);
  const maxRetries = options.maxRetries || 1;
  
  let attempts = 0;
  let lastError: Error | null = null;
  
  while (attempts < maxRetries + 1) { // +1 for the initial attempt
    try {
      const chatSession = model.startChat({
        history: [],
      });
      
      const result = await chatSession.sendMessage(prompt);
      const responseText = result.response.text();
      
      try {
        // Parse the response
        const response = parseDetectionResponse(responseText);
        
        // Add chunk metadata if this is a partial review
        if (options.isPartialReview && options.chunkContext) {
          // Extract original line information from context if available
          const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
          response.chunkMetadata = {
            chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
            isPartialReview: true,
            originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
            originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
          };
        }
        
        // Validate the quality of the detection
        if (!validateDetectionQuality(response)) {
          if (attempts < maxRetries) {
            attempts++;
            continue; // Try again
          } else {
            // On last attempt, try repair approach
            return await repairDetection(chatSession, code, options);
          }
        }
        
        return response;
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
        
        if (attempts < maxRetries) {
          attempts++;
          continue; // Try again
        } else {
          return await repairDetection(chatSession, code, options);
        }
      }
    } catch (apiError) {
      console.error(`Attempt ${attempts + 1} error calling Gemini API:`, apiError);
      lastError = apiError instanceof Error ? apiError : new Error(String(apiError));
      
      if (attempts < maxRetries) {
        attempts++;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
        continue; // Try again after waiting
      } else {
        throw new Error(`Failed to detect code issues after ${maxRetries + 1} attempts: ${lastError?.message}`);
      }
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw new Error(`Failed to detect code issues: ${lastError?.message}`);
}

/**
 * Retries the issue detection with more explicit formatting instructions.
 */
async function repairDetection(
  chatSession: ChatSession, 
  code: string,
  options: CodeReviewOptions = {}
): Promise<CodeIssueDetectionResponse> {
  const retryPrompt = `
Your previous response couldn't be properly parsed as JSON. Please review the code again and respond ONLY with a valid JSON object.

The response must be a VALID JSON object with this structure:
{
  "summary": "string",
  "issues": [
    {
      "id": "string",
      "type": "string",
      "description": "string",
      "lineNumbers": [number],
      "severity": "critical|high|medium|low",
      "impact": "string",
      "proposedSolution": "string"
    }
  ],
  "codeQualityScore": {
    "overall": number,
    "categories": {
      "readability": number,
      "maintainability": number,
      "simplicity": number,
      "consistency": number
    }
  }
}

IMPORTANT RULES:
1. Respond ONLY with valid JSON
2. Ensure all string values with quotes or special characters are properly escaped
3. The JSON must be properly formatted with no trailing commas or syntax errors
4. DO NOT include any markdown formatting, only pure JSON
5. Make sure each issue has a unique "id" field
`;

  try {
    const result = await chatSession.sendMessage(retryPrompt);
    const responseText = result.response.text();
    
    try {
      const response = parseDetectionResponse(responseText);
      
      // Add chunk metadata if this is a partial review
      if (options.isPartialReview && options.chunkContext) {
        const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
        response.chunkMetadata = {
          chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
          isPartialReview: true,
          originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
          originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
        };
      }
      
      return response;
    } catch (parseError) {
      console.error('Error parsing JSON in retry response:', parseError);
      
      // One more attempt with even stricter instructions
      return await lastChanceDetection(chatSession, code, options);
    }
  } catch (retryError) {
    console.error('Error in retry detection:', retryError);
    return createFallbackDetection(code, options);
  }
}

/**
 * Last attempt to get a valid JSON response for detection.
 */
async function lastChanceDetection(
  chatSession: ChatSession, 
  code: string,
  options: CodeReviewOptions = {}
): Promise<CodeIssueDetectionResponse> {
  const finalAttemptPrompt = `
I'm still unable to parse your response as valid JSON. Please respond with ONLY the following minimal JSON structure:

{
  "summary": "Brief review of code quality",
  "issues": [
    {
      "id": "issue-1",
      "type": "readability",
      "description": "Issue description",
      "severity": "medium",
      "impact": "Impact description",
      "proposedSolution": "Brief solution description"
    }
  ]
}

Double-check that your response contains ONLY this JSON object with no additional text, markdown formatting, or explanations.
`;

  try {
    const result = await chatSession.sendMessage(finalAttemptPrompt);
    const responseText = result.response.text();
    
    try {
      const response = parseDetectionResponse(responseText);
      
      // Add chunk metadata if this is a partial review
      if (options.isPartialReview && options.chunkContext) {
        const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
        response.chunkMetadata = {
          chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
          isPartialReview: true,
          originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
          originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
        };
      }
      
      return response;
    } catch (finalError) {
      console.error('Final attempt failed to parse JSON:', finalError);
      return createFallbackDetection(code, options);
    }
  } catch (lastAttemptError) {
    console.error('Error in final detection attempt:', lastAttemptError);
    return createFallbackDetection(code, options);
  }
}

/**
 * Creates a fallback detection response when all attempts fail.
 */
function createFallbackDetection(
  code: string,
  options: CodeReviewOptions = {}
): CodeIssueDetectionResponse {
  const response: CodeIssueDetectionResponse = {
    summary: "We encountered an issue generating a detailed code review. Here are some general suggestions for improving code quality.",
    issues: [{
      id: "fallback-1",
      type: "general",
      description: "Unable to analyze specific issues in the provided code",
      severity: "medium",
      impact: "Consider reviewing the code manually for common clean code issues",
      proposedSolution: "Run a linter or static code analysis tool on your code"
    }]
  };
  
  // Add chunk metadata if this is a partial review
  if (options.isPartialReview && options.chunkContext) {
    const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
    response.chunkMetadata = {
      chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
      isPartialReview: true,
      originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
      originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
    };
  }
  
  return response;
}

/**
 * Second phase: Implements code changes based on approved issues.
 * Takes the detection results and a list of approved issue IDs.
 */
export async function implementCodeChanges(
  code: string, 
  language: string,
  detectionResult: CodeIssueDetectionResponse,
  options: CodeReviewOptions = {}
): Promise<CodeImplementationResponse> {
  const { model } = initGeminiApi();
  const prompt = createImplementationPrompt(code, language, detectionResult, options);
  const maxRetries = options.maxRetries || 1;
  
  let attempts = 0;
  let lastError: Error | null = null;
  
  while (attempts < maxRetries + 1) { // +1 for the initial attempt
    try {
      const chatSession = model.startChat({
        history: [],
      });
      
      const result = await chatSession.sendMessage(prompt);
      const responseText = result.response.text();
      
      try {
        // Parse the response
        const response = parseImplementationResponse(responseText);
        
        // Ensure improvedCode is populated
        if (!response.improvedCode || response.improvedCode.trim().length === 0) {
          response.improvedCode = code;
        }
        
        // Add chunk metadata if this is a partial review
        if (options.isPartialReview && options.chunkContext) {
          // Extract original line information from context if available
          const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
          response.chunkMetadata = {
            chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
            isPartialReview: true,
            originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
            originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
          };
        }
        
        // Validate the quality of the implementation
        if (!validateImplementationQuality(response)) {
          if (attempts < maxRetries) {
            attempts++;
            continue; // Try again
          } else {
            // On last attempt, try repair approach
            return await repairImplementation(chatSession, code, detectionResult, options);
          }
        }
        
        return response;
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
        
        if (attempts < maxRetries) {
          attempts++;
          continue; // Try again
        } else {
          return await repairImplementation(chatSession, code, detectionResult, options);
        }
      }
    } catch (apiError) {
      console.error(`Attempt ${attempts + 1} error calling Gemini API:`, apiError);
      lastError = apiError instanceof Error ? apiError : new Error(String(apiError));
      
      if (attempts < maxRetries) {
        attempts++;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
        continue; // Try again after waiting
      } else {
        throw new Error(`Failed to implement code changes after ${maxRetries + 1} attempts: ${lastError?.message}`);
      }
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw new Error(`Failed to implement code changes: ${lastError?.message}`);
}

/**
 * Retries the implementation with more explicit formatting instructions.
 */
async function repairImplementation(
  chatSession: ChatSession, 
  code: string,
  detectionResult: CodeIssueDetectionResponse,
  options: CodeReviewOptions = {}
): Promise<CodeImplementationResponse> {
  const retryPrompt = `
Your previous response couldn't be properly parsed as JSON. Please implement the changes again and respond ONLY with a valid JSON object.

The response must be a VALID JSON object with this structure:
{
  "summary": "string",
  "appliedChanges": [
    {
      "issueId": "string",
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
5. Make sure the "issueId" fields match the issues from the detection phase
`;

  try {
    const result = await chatSession.sendMessage(retryPrompt);
    const responseText = result.response.text();
    
    try {
      const response = parseImplementationResponse(responseText);
      
      // Ensure improvedCode is populated
      if (!response.improvedCode || response.improvedCode.trim().length === 0) {
        response.improvedCode = code;
      }
      
      // Add chunk metadata if this is a partial review
      if (options.isPartialReview && options.chunkContext) {
        const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
        response.chunkMetadata = {
          chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
          isPartialReview: true,
          originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
          originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
        };
      }
      
      return response;
    } catch (parseError) {
      console.error('Error parsing JSON in retry response:', parseError);
      
      // One more attempt with even stricter instructions
      return await lastChanceImplementation(chatSession, code, detectionResult, options);
    }
  } catch (retryError) {
    console.error('Error in retry implementation:', retryError);
    return createFallbackImplementation(code, options);
  }
}

/**
 * Last attempt to get a valid JSON response for implementation.
 */
async function lastChanceImplementation(
  chatSession: ChatSession, 
  code: string,
  detectionResult: CodeIssueDetectionResponse,
  options: CodeReviewOptions = {}
): Promise<CodeImplementationResponse> {
  const finalAttemptPrompt = `
I'm still unable to parse your response as valid JSON. Please respond with ONLY the following minimal JSON structure:

{
  "summary": "Brief summary of changes",
  "appliedChanges": [
    {
      "issueId": "${detectionResult.issues[0]?.id || 'issue-1'}",
      "description": "Description of the change",
      "before": "Before code",
      "after": "After code",
      "benefits": "Benefits of this change"
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
      const response = parseImplementationResponse(responseText);
      
      // Ensure improvedCode is populated
      if (!response.improvedCode || response.improvedCode.trim().length === 0) {
        response.improvedCode = code;
      }
      
      // Add chunk metadata if this is a partial review
      if (options.isPartialReview && options.chunkContext) {
        const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
        response.chunkMetadata = {
          chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
          isPartialReview: true,
          originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
          originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
        };
      }
      
      return response;
    } catch (finalError) {
      console.error('Final attempt failed to parse JSON:', finalError);
      return createFallbackImplementation(code, options);
    }
  } catch (lastAttemptError) {
    console.error('Error in final implementation attempt:', lastAttemptError);
    return createFallbackImplementation(code, options);
  }
}

/**
 * Creates a fallback implementation response when all attempts fail.
 */
function createFallbackImplementation(
  code: string,
  options: CodeReviewOptions = {}
): CodeImplementationResponse {
  const response: CodeImplementationResponse = {
    summary: "We encountered an issue generating the implementation changes. The original code has been preserved.",
    appliedChanges: [{
      issueId: "fallback-1",
      description: "Unable to apply changes to the provided code",
      before: "",
      after: "",
      benefits: "Please try again or implement the changes manually based on the detection phase"
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
  
  // Add chunk metadata if this is a partial review
  if (options.isPartialReview && options.chunkContext) {
    const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
    response.chunkMetadata = {
      chunkId: options.chunkContext.match(/chunk ID: (\w+)/i)?.[1] || 'unknown',
      isPartialReview: true,
      originalLineStart: lineMatch ? parseInt(lineMatch[1], 10) : 0,
      originalLineEnd: lineMatch ? parseInt(lineMatch[2], 10) : 0
    };
  }
  
  return response;
}

/**
 * Combines both phases (detection and implementation) into a single CodeReviewResponse.
 * This is for backward compatibility with the existing UI.
 */
export function combineReviewResults(
  detectionResult: CodeIssueDetectionResponse,
  implementationResult: CodeImplementationResponse
): CodeReviewResponse {
  return {
    phase: 'complete',
    summary: implementationResult.summary,
    issues: detectionResult.issues,
    suggestions: implementationResult.appliedChanges.map(change => ({
      description: change.description,
      before: change.before,
      after: change.after,
      benefits: change.benefits
    })),
    improvedCode: implementationResult.improvedCode,
    learningResources: implementationResult.learningResources,
    seniorReviewTime: implementationResult.seniorReviewTime,
    chunkMetadata: implementationResult.chunkMetadata || detectionResult.chunkMetadata,
    codeQualityScore: detectionResult.codeQualityScore
  };
}

/**
 * For backward compatibility: Sends code to Gemini API for review and returns a combined response.
 * This performs both detection and implementation phases automatically.
 */
export async function reviewCode(
  code: string, 
  language: string,
  options: CodeReviewOptions = {}
): Promise<CodeReviewResponse> {
  try {
    // First phase: Detect issues
    const detectionResult = await detectCodeIssues(code, language, options);
    
    // Auto-approve all issues (for backward compatibility)
    const approvedIssueIds = detectionResult.issues.map(issue => issue.id);
    
    // Second phase: Implement changes
    const implementationResult = await implementCodeChanges(
      code, 
      language, 
      detectionResult, 
      {
        ...options,
        approvedIssues: approvedIssueIds
      }
    );
    
    // Combine the results
    return combineReviewResults(detectionResult, implementationResult);
  } catch (error) {
    console.error('Error in reviewCode:', error);
    throw error;
  }
}

/**
 * Reviews a specific chunk of code with context awareness.
 * @param chunk - The code chunk to review
 * @param options - Review options
 * @returns Code review response for the chunk
 */
export async function reviewCodeChunk(
  chunk: CodeChunk,
  options: CodeReviewOptions = {}
): Promise<CodeReviewResponse> {
  // Create chunk-specific context
  let chunkContext = `Chunk ID: ${chunk.id}, lines ${chunk.startLine}-${chunk.endLine}`;
  
  if (chunk.context) {
    if (chunk.context.imports && chunk.context.imports.length > 0) {
      chunkContext += `\nImports: ${chunk.context.imports.join(', ')}`;
    }
    if (chunk.context.declarations && chunk.context.declarations.length > 0) {
      chunkContext += `\nDeclarations: ${chunk.context.declarations.join(', ')}`;
    }
    if (chunk.context.dependencies && chunk.context.dependencies.length > 0) {
      chunkContext += `\nDependencies: ${chunk.context.dependencies.join(', ')}`;
    }
  }
  
  if (chunk.metadata) {
    chunkContext += `\nMetadata: ${JSON.stringify(chunk.metadata)}`;
  }
  
  // For backward compatibility: perform full review
  return reviewCode(chunk.code, chunk.language, {
    ...options,
    chunkContext,
    isPartialReview: true,
    maxRetries: 2 // More retries for chunk processing
  });
}

/**
 * Streams code review results from Gemini API.
 * Enhanced to support chunked processing and two-phase approach.
 * @param code - Code to be reviewed
 * @param language - Programming language of the code
 * @param options - Review options
 * @returns ReadableStream of Server-Sent Events
 */
export async function reviewCodeStream(
  code: string,
  language: string,
  options: CodeReviewOptions = {},
  phase: 'detection' | 'implementation' | 'complete' = 'complete'
): Promise<ReadableStream> {
  const { model } = initGeminiApi();
  
  // Choose prompt based on the phase
  let prompt: string;
  if (phase === 'detection') {
    prompt = createIssueDetectionPrompt(code, language, options);
  } else if (phase === 'implementation' && options.approvedIssues) {
    // We need detection results for implementation
    if (!options.approvedIssues?.length) {
      throw new Error('No approved issues provided for implementation phase');
    }
    
    // Create a dummy detection result with approved issues
    const dummyDetection: CodeIssueDetectionResponse = {
      summary: "Previously detected issues",
      issues: options.approvedIssues.map(id => ({
        id,
        type: "unknown",
        description: `Issue ${id}`,
        severity: "medium" as const,
        impact: "Unknown impact",
        proposedSolution: "Unknown solution",
        approved: true
      }))
    };
    
    prompt = createImplementationPrompt(code, language, dummyDetection, options);
  } else {
    // Complete review - use detection prompt for first phase
    prompt = createIssueDetectionPrompt(code, language, options);
  }
  
  // Create encoder for text encoding
  const encoder = new TextEncoder();
  
  // Create a stream for the response
  return new ReadableStream({
    async start(controller) {
      try {
        // Send initial state event
        controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
          status: phase === 'detection' ? 'detecting' : 'analyzing', 
          progress: 0 
        })}\n\n`));
        
        if (phase === 'complete') {
          // For complete reviews, perform both phases in sequence
          
          // Phase 1: Detection
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
            status: 'detecting', 
            progress: 5,
            message: 'Identifying code issues...'
          })}\n\n`));
          
          // Detect issues
          const detectionResult = await detectCodeIssues(code, language, options);
          
          // Send detection results
          controller.enqueue(encoder.encode(`event: detection\ndata: ${JSON.stringify(detectionResult)}\n\n`));
          
          // Update progress
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
            status: 'implementing', 
            progress: 40,
            message: 'Implementing improvements...'
          })}\n\n`));
          
          // Auto-approve all issues (for backward compatibility)
          const approvedIssueIds = detectionResult.issues.map(issue => issue.id);
          
          // Phase 2: Implementation
          const implementationResult = await implementCodeChanges(
            code, 
            language, 
            detectionResult, 
            {
              ...options,
              approvedIssues: approvedIssueIds
            }
          );
          
          // Send implementation results
          controller.enqueue(encoder.encode(`event: implementation\ndata: ${JSON.stringify(implementationResult)}\n\n`));
          
          // Combine results
          const combinedResult = combineReviewResults(detectionResult, implementationResult);
          
          // Send completion event
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
            status: 'completed', 
            progress: 100 
          })}\n\n`));
          
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(combinedResult)}\n\n`));
        } else if (phase === 'detection') {
          // For detection-only reviews
          
          // Initialize Gemini chat session
          const chatSession = model.startChat({ history: [] });
          
          // Start streaming response from Gemini
          const streamResult = await chatSession.sendMessageStream(prompt);
          
          // Track accumulated text for JSON parsing
          let accumulatedText = "";
          let progress = 10;
          
          // Process each chunk as it arrives
          for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            accumulatedText += chunkText;
            
            try {
              // Try to find and parse JSON in the accumulated text
              const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const potentialJson = jsonMatch[0];
                try {
                  // Attempt to parse the JSON
                  JSON.parse(potentialJson);
                  
                  // Update progress
                  progress = Math.min(90, progress + 5);
                  controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
                    status: 'detecting', 
                    progress 
                  })}\n\n`));
                } catch {
                  // Continue accumulating
                }
              }
            } catch {
              // Continue despite errors in partial parsing
            }
          }
          
          // Get the final complete response text
          const response = await streamResult.response;
          const responseText = response.text();
          
          try {
            // Parse the complete response
            const detectionResult = parseDetectionResponse(responseText);
            
            // Send completion event
            controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
              status: 'detected', 
              progress: 100 
            })}\n\n`));
            
            controller.enqueue(encoder.encode(`event: detection\ndata: ${JSON.stringify(detectionResult)}\n\n`));
          } catch (error) {
            // If parsing fails, try the retry mechanisms
            console.error('Error parsing JSON response:', error);
            const chatSession = model.startChat({ history: [] });
            const retryResult = await repairDetection(chatSession, code, options);
            
            // Send the retry result
            controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
              status: 'detected', 
              progress: 100 
            })}\n\n`));
            
            controller.enqueue(encoder.encode(`event: detection\ndata: ${JSON.stringify(retryResult)}\n\n`));
          }
        } else if (phase === 'implementation') {
          // For implementation-only reviews
          
          // Initialize Gemini chat session
          const chatSession = model.startChat({ history: [] });
          
          // Start streaming response from Gemini
          const streamResult = await chatSession.sendMessageStream(prompt);
          
          // Track accumulated text for JSON parsing
          let accumulatedText = "";
          let progress = 10;
          
          // Process each chunk as it arrives
          for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            accumulatedText += chunkText;
            
            try {
              // Try to find and parse JSON in the accumulated text
              const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const potentialJson = jsonMatch[0];
                try {
                  // Attempt to parse the JSON
                  JSON.parse(potentialJson);
                  
                  // Update progress
                  progress = Math.min(90, progress + 5);
                  controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
                    status: 'implementing', 
                    progress 
                  })}\n\n`));
                } catch {
                  // Continue accumulating
                }
              }
            } catch {
              // Continue despite errors in partial parsing
            }
          }
          
          // Get the final complete response text
          const response = await streamResult.response;
          const responseText = response.text();
          
          try {
            // Parse the complete response
            const implementationResult = parseImplementationResponse(responseText);
            
            // Ensure improvedCode is populated
            if (!implementationResult.improvedCode || implementationResult.improvedCode.trim().length === 0) {
              implementationResult.improvedCode = code;
            }
            
            // Send completion event
            controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
              status: 'implemented', 
              progress: 100 
            })}\n\n`));
            
            controller.enqueue(encoder.encode(`event: implementation\ndata: ${JSON.stringify(implementationResult)}\n\n`));
          } catch (error) {
            // If parsing fails, try the retry mechanisms
            console.error('Error parsing JSON response:', error);
            
            // Create a dummy detection result with approved issues
            const dummyDetection: CodeIssueDetectionResponse = {
              summary: "Previously detected issues",
              issues: options.approvedIssues?.map(id => ({
                id,
                type: "unknown",
                description: `Issue ${id}`,
                severity: "medium" as const,
                impact: "Unknown impact",
                proposedSolution: "Unknown solution",
                approved: true
              })) || []
            };
            
            const retryResult = await repairImplementation(chatSession, code, dummyDetection, options);
            
            // Send the retry result
            controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
              status: 'implemented', 
              progress: 100 
            })}\n\n`));
            
            controller.enqueue(encoder.encode(`event: implementation\ndata: ${JSON.stringify(retryResult)}\n\n`));
          }
        }
        
        // Close the stream
        controller.close();
      } catch (error) {
        // Handle errors
        console.error('Streaming error:', error);
        
        // Send error event
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ 
          message: error instanceof Error ? error.message : 'Unknown error during code review' 
        })}\n\n`));
        
        // Close the stream
        controller.close();
      }
    }
  });
}