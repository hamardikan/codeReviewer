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
import { CodeChunk } from "./chunker";

// Interface for preliminary analysis results
export interface CodeReviewMap {
  targetAreas: Array<{
    startLine: number;
    endLine: number;
    type: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    cleanCodePrinciple?: string;
  }>;
  overallStructure: {
    functions: Array<{
      name: string;
      startLine: number;
      endLine: number;
    }>;
    classes: Array<{
      name: string;
      startLine: number;
      endLine: number;
    }>;
    imports: string[];
  };
  generalIssues: Array<{
    type: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    impact: string;
  }>;
}

// New interface for code change sections in the GitHub-style diff view
export interface CodeChangeSection {
  id: string;
  type: 'unchanged' | 'changed';
  content: string;  // The improved code
  original?: string; // The original code (for changed sections)
  explanation?: string;
  cleanCodePrinciple?: string;
  lineNumbers?: string; // For reference (as a string like "45-48")
}

// Review response type definition with expanded properties
export interface CodeReviewResponse {
  summary: string;
  // New field for GitHub-style diff view
  codeSections?: CodeChangeSection[];
  // Clean code principles with counts
  cleanCodePrinciples?: {
    [principle: string]: number; // Count of changes per principle
  };
  // Original fields kept for backward compatibility
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
  // Track if this response is for a chunk
  chunkMetadata?: {
    chunkId: string;
    isPartialReview: boolean;
    originalLineStart: number;
    originalLineEnd: number;
  };
  // New: reference to the preliminary analysis for context
  reviewMap?: CodeReviewMap;
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
  reviewMap?: CodeReviewMap; // Pass the preliminary analysis
  fullCodeContext?: string; // Full code for context
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
 * Performs a preliminary analysis of the entire codebase to identify areas that need attention.
 * This helps with context-aware chunking and ensures holistic understanding of the code.
 * 
 * @param code - The full code to analyze
 * @param language - Programming language of the code
 * @param options - Review options
 * @returns CodeReviewMap with identified target areas and overall structure
 */
export async function performPreliminaryAnalysis(
  code: string,
  language: string,
  options: CodeReviewOptions = {}
): Promise<CodeReviewMap> {
  const { model } = initGeminiApi();
  const prompt = createPreliminaryAnalysisPrompt(code, language, options);
  
  try {
    const chatSession = model.startChat({
      history: [],
    });
    
    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text();
    
    try {
      // Parse the response
      const response = JSON.parse(responseText);
      
      // Validate and return the result
      return validateAndRepairReviewMap(response, code);
    } catch (parseError) {
      console.error('Error parsing preliminary analysis JSON:', parseError);
      // Return a minimal valid review map as fallback
      return createFallbackReviewMap(code, language);
    }
  } catch (apiError) {
    console.error('Error calling Gemini API for preliminary analysis:', apiError);
    // Return a minimal valid review map as fallback
    return createFallbackReviewMap(code, language);
  }
}

/**
 * Creates a prompt for the preliminary analysis of the codebase.
 */
function createPreliminaryAnalysisPrompt(
  code: string,
  language: string,
  options: CodeReviewOptions = {}
): string {
  const { reviewFocus } = options;
  const focusAreas = [];
  
  if (!reviewFocus || reviewFocus.cleanCode) {
    focusAreas.push(
      "Meaningful Names (clear, intention-revealing variable and function names)",
      "Functions (small, focused, single responsibility)",
      "Comments (explanatory, necessary, not redundant)",
      "Formatting (consistent indentation, spacing, and layout)",
      "Error Handling (proper validation, exceptions with context)",
      "Simplicity (DRY principle, reduced complexity, no dead code)"
    );
  }
    
  if (reviewFocus?.performance) {
    focusAreas.push(
      "Algorithm Efficiency (optimal algorithms and Big O complexity)",
      "Resource Optimization (memory, CPU, network efficiency)",
      "Computational Efficiency (reducing unnecessary operations)",
      "Performance Hotspots (identifying and optimizing bottlenecks)",
      "Data Structure Selection (choosing appropriate structures)",
      "Caching and Memoization (reusing computed results)"
    );
  }
    
  if (reviewFocus?.security) {
    focusAreas.push(
      "Input Validation (sanitizing and validating all inputs)",
      "Authentication/Authorization (proper security controls)",
      "Data Protection (handling sensitive information securely)",
      "Vulnerability Prevention (XSS, CSRF, injection attacks)",
      "Secure Communication (proper encryption and protocols)",
      "Error Handling Security (preventing information disclosure)"
    );
  }

  return `
You are an expert senior software engineer conducting a preliminary analysis of code before a detailed review.
Your task is to identify code areas that need attention and understand the overall structure of the codebase.
This analysis will guide a context-aware code review process.

ANALYZE THIS ${language.toUpperCase()} CODE:
\`\`\`${language}
${code}
\`\`\`

You must respond with a JSON object that follows this EXACT structure:
{
  "targetAreas": [
    {
      "startLine": number,
      "endLine": number,
      "type": "string",
      "description": "string",
      "severity": "critical|high|medium|low",
      "cleanCodePrinciple": "string"
    }
  ],
  "overallStructure": {
    "functions": [
      {
        "name": "string",
        "startLine": number,
        "endLine": number
      }
    ],
    "classes": [
      {
        "name": "string",
        "startLine": number,
        "endLine": number
      }
    ],
    "imports": ["string"]
  },
  "generalIssues": [
    {
      "type": "string",
      "description": "string",
      "severity": "critical|high|medium|low",
      "impact": "string"
    }
  ]
}

IMPORTANT GUIDELINES:
1. Be precise with line numbers to ensure accurate context-aware chunking
2. Identify 3-10 specific target areas that need improvement (not every minor issue)
3. Categorize each target area by its relevant clean code principle
4. Capture the overall structure to maintain context during chunked review
5. Include general issues that affect the codebase as a whole
6. Ensure the response is valid JSON with proper numeric values for line numbers

Focus specifically on these clean code principles:
${focusAreas.map(area => `- ${area}`).join('\n')}

This preliminary analysis will be used to guide a context-aware code review process that preserves the meaningful context needed for appropriate suggestions.
`;
}

/**
 * Validates and repairs a review map, ensuring all required fields are present.
 */
function validateAndRepairReviewMap(response: any, code: string): CodeReviewMap {
  const lines = code.split('\n').length;
  
  // Ensure the targetAreas array exists and is valid
  if (!Array.isArray(response.targetAreas)) {
    response.targetAreas = [];
  }
  
  // Validate and repair target areas
  response.targetAreas = response.targetAreas.map((area: any) => ({
    startLine: typeof area.startLine === 'number' ? area.startLine : 0,
    endLine: typeof area.endLine === 'number' ? 
      Math.min(area.endLine, lines - 1) : 
      Math.min(area.startLine + 5, lines - 1),
    type: area.type || 'unknown',
    description: area.description || 'Area needs improvement',
    severity: ['critical', 'high', 'medium', 'low'].includes(area.severity) ? 
      area.severity : 'medium',
    cleanCodePrinciple: area.cleanCodePrinciple || getCategoryFromDescription(area.description || '')
  }));
  
  // Ensure overallStructure exists
  if (!response.overallStructure) {
    response.overallStructure = {
      functions: [],
      classes: [],
      imports: []
    };
  }
  
  // Validate functions
  if (!Array.isArray(response.overallStructure.functions)) {
    response.overallStructure.functions = [];
  }
  
  // Validate classes
  if (!Array.isArray(response.overallStructure.classes)) {
    response.overallStructure.classes = [];
  }
  
  // Validate imports
  if (!Array.isArray(response.overallStructure.imports)) {
    response.overallStructure.imports = [];
  }
  
  // Ensure generalIssues exists
  if (!Array.isArray(response.generalIssues)) {
    response.generalIssues = [];
  }
  
  // Validate general issues
  response.generalIssues = response.generalIssues.map((issue: any) => ({
    type: issue.type || 'general',
    description: issue.description || 'Code quality issue detected',
    severity: ['critical', 'high', 'medium', 'low'].includes(issue.severity) ? 
      issue.severity : 'medium',
    impact: issue.impact || 'May affect code quality and maintainability'
  }));
  
  return response as CodeReviewMap;
}

/**
 * Creates a fallback review map when analysis fails.
 */
function createFallbackReviewMap(code: string, language: string): CodeReviewMap {
  const lines = code.split('\n');
  
  // Create a minimal valid review map
  return {
    targetAreas: [],
    overallStructure: {
      functions: detectFunctions(code, language),
      classes: detectClasses(code, language),
      imports: detectImports(code, language)
    },
    generalIssues: [{
      type: "general",
      description: "Automated preliminary analysis was unable to run. Proceeding with general code review.",
      severity: "medium",
      impact: "May miss context-specific improvements"
    }]
  };
}

/**
 * Simple function detection for fallback map
 */
function detectFunctions(code: string, language: string): Array<{name: string, startLine: number, endLine: number}> {
  const functions: Array<{name: string, startLine: number, endLine: number}> = [];
  const lines = code.split('\n');
  
  let functionRegex: RegExp;
  
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      functionRegex = /\bfunction\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s*)?\s*(\w+)\s*\([^)]*\)\s*\{/;
      break;
    case 'python':
      functionRegex = /\bdef\s+(\w+)\s*\(/;
      break;
    case 'java':
    case 'csharp':
    case 'cpp':
      functionRegex = /(?:public|private|protected|static|void|int|string|boolean|float|double|long|var|auto)\s+(\w+)\s*\([^)]*\)/;
      break;
    default:
      functionRegex = /\bfunction\s+(\w+)|\bdef\s+(\w+)/;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(functionRegex);
    if (match) {
      // Find the first non-null capturing group as the function name
      const name = match.slice(1).find(m => m) || 'unknown';
      
      // Estimate function end by finding the next function or end of file
      let endLine = i;
      let braceLevel = 0;
      
      for (let j = i + 1; j < lines.length; j++) {
        // Count braces to find function end
        if (lines[j].includes('{')) braceLevel++;
        if (lines[j].includes('}')) {
          braceLevel--;
          if (braceLevel <= 0 && lines[j].trim() === '}') {
            endLine = j;
            break;
          }
        }
        
        // For Python, check indentation
        if (language === 'python') {
          const currentIndent = (lines[i].match(/^\s*/) || [''])[0].length;
          const lineIndent = (lines[j].match(/^\s*/) || [''])[0].length;
          
          // If line has content and is at same or lower indentation, function ended
          if (lines[j].trim() !== '' && lineIndent <= currentIndent) {
            endLine = j - 1;
            break;
          }
        }
        
        // If another function starts, end previous function
        if (j !== i && lines[j].match(functionRegex)) {
          endLine = j - 1;
          break;
        }
      }
      
      functions.push({
        name, 
        startLine: i,
        endLine: Math.max(endLine, i + 1) // Ensure at least one line
      });
    }
  }
  
  return functions;
}

/**
 * Simple class detection for fallback map
 */
function detectClasses(code: string, language: string): Array<{name: string, startLine: number, endLine: number}> {
  const classes: Array<{name: string, startLine: number, endLine: number}> = [];
  const lines = code.split('\n');
  
  let classRegex: RegExp;
  
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      classRegex = /\bclass\s+(\w+)/;
      break;
    case 'python':
      classRegex = /\bclass\s+(\w+)(?:\(.*\))?:/;
      break;
    case 'java':
    case 'csharp':
    case 'cpp':
      classRegex = /\bclass\s+(\w+)(?:\s+extends|\s+implements|\s+:|<)?/;
      break;
    default:
      classRegex = /\bclass\s+(\w+)/;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(classRegex);
    if (match) {
      const name = match[1];
      
      // Estimate class end by finding the next class or end of file
      let endLine = i;
      let braceLevel = 0;
      
      for (let j = i + 1; j < lines.length; j++) {
        // Count braces to find class end
        if (lines[j].includes('{')) braceLevel++;
        if (lines[j].includes('}')) {
          braceLevel--;
          if (braceLevel <= 0 && lines[j].trim() === '}') {
            endLine = j;
            break;
          }
        }
        
        // For Python, check indentation
        if (language === 'python') {
          const currentIndent = (lines[i].match(/^\s*/) || [''])[0].length;
          const lineIndent = (lines[j].match(/^\s*/) || [''])[0].length;
          
          // If line has content and is at same or lower indentation, class ended
          if (lines[j].trim() !== '' && lineIndent <= currentIndent) {
            endLine = j - 1;
            break;
          }
        }
        
        // If another class starts, end previous class
        if (j !== i && lines[j].match(classRegex)) {
          endLine = j - 1;
          break;
        }
      }
      
      classes.push({
        name, 
        startLine: i,
        endLine: Math.max(endLine, i + 5) // Ensure at least a few lines
      });
    }
  }
  
  return classes;
}

/**
 * Simple import detection for fallback map
 */
function detectImports(code: string, language: string): string[] {
  const imports: string[] = [];
  const lines = code.split('\n');
  
  let importRegex: RegExp;
  
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      importRegex = /\b(import|require)\b/;
      break;
    case 'python':
      importRegex = /\b(import|from)\b/;
      break;
    case 'java':
      importRegex = /\bimport\s+[\w.]+;/;
      break;
    case 'csharp':
      importRegex = /\busing\s+[\w.]+;/;
      break;
    case 'cpp':
    case 'c':
      importRegex = /\b#include\b/;
      break;
    default:
      importRegex = /\b(import|require|using|#include)\b/;
  }
  
  for (const line of lines) {
    if (importRegex.test(line)) {
      imports.push(line.trim());
    }
  }
  
  return imports;
}

/**
 * Creates a prompt for the Gemini model to analyze code based on Clean Code principles.
 * Enhanced with context from preliminary analysis.
 * 
 * @param code - Code to be reviewed
 * @param language - Programming language of the code
 * @param options - Review options including focus areas and chunk context
 * @returns Formatted prompt for code review
 */
function createCodeReviewPrompt(
  code: string, 
  language: string, 
  options: CodeReviewOptions = {}
): string {
  const { reviewFocus, chunkContext, isPartialReview, reviewMap, fullCodeContext } = options;
  const focusAreas = [];
  
  if (!reviewFocus || reviewFocus.cleanCode) {
    focusAreas.push(
      "Meaningful Names (clear, intention-revealing variable and function names)",
      "Functions (small, focused, single responsibility)",
      "Comments (explanatory, necessary, not redundant)",
      "Formatting (consistent indentation, spacing, and layout)",
      "Error Handling (proper validation, exceptions with context)",
      "Simplicity (DRY principle, reduced complexity, no dead code)"
    );
  }
    
  if (reviewFocus?.performance) {
    focusAreas.push(
      "Algorithm Efficiency (optimal algorithms and Big O complexity)",
      "Resource Optimization (memory, CPU, network efficiency)",
      "Computational Efficiency (reducing unnecessary operations)",
      "Performance Hotspots (identifying and optimizing bottlenecks)",
      "Data Structure Selection (choosing appropriate structures)",
      "Caching and Memoization (reusing computed results)"
    );
  }
    
  if (reviewFocus?.security) {
    focusAreas.push(
      "Input Validation (sanitizing and validating all inputs)",
      "Authentication/Authorization (proper security controls)",
      "Data Protection (handling sensitive information securely)",
      "Vulnerability Prevention (XSS, CSRF, injection attacks)",
      "Secure Communication (proper encryption and protocols)",
      "Error Handling Security (preventing information disclosure)"
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

  // Add context from preliminary analysis if available
  let analysisContext = '';
  if (reviewMap) {
    // Format the target areas
    const targetAreas = reviewMap.targetAreas
      .filter(area => isAreaRelevantToChunk(area, code, options))
      .map(area => `- Lines ${area.startLine}-${area.endLine}: ${area.description} (${area.cleanCodePrinciple})`)
      .join('\n');
    
    // Format the overall structure
    const functions = reviewMap.overallStructure.functions
      .map(func => `- ${func.name}: Lines ${func.startLine}-${func.endLine}`)
      .join('\n');
    
    const classes = reviewMap.overallStructure.classes
      .map(cls => `- ${cls.name}: Lines ${cls.startLine}-${cls.endLine}`)
      .join('\n');
    
    // Add the context
    if (targetAreas || functions || classes) {
      analysisContext = `
PRELIMINARY ANALYSIS CONTEXT:
${targetAreas ? `Target Areas:\n${targetAreas}\n` : ''}
${functions ? `Functions:\n${functions}\n` : ''}
${classes ? `Classes:\n${classes}\n` : ''}`;
    }
  }

  return `
You are an expert senior software engineer conducting a code review for a junior developer. Your mission is to provide actionable feedback organized by clean code principles.

${chunkInstructions}
${analysisContext}

REVIEW THIS ${language.toUpperCase()} CODE:
\`\`\`${language}
${code}
\`\`\`

You must respond with a JSON object that follows this EXACT structure:
{
  "summary": "Brief overview of code quality and most important improvements",
  "codeSections": [
    {
      "id": "unique-section-id",
      "type": "unchanged",
      "content": "Code that doesn't need changes"
    },
    {
      "id": "unique-section-id",
      "type": "changed",
      "content": "Improved code after changes",
      "original": "Original code before changes",
      "explanation": "Clear explanation of why this change improves the code",
      "cleanCodePrinciple": "The specific principle (Meaningful Names, Functions, Comments, etc.)",
      "lineNumbers": "Line numbers affected (e.g., '45-48' or '12')"
    }
  ],
  "cleanCodePrinciples": {
    "Meaningful Names": 2,
    "Functions": 1,
    "Error Handling": 1
  },
  "improvedCode": "Complete revised version of the code with ALL suggested improvements applied",
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
  ]
}

IMPORTANT GUIDELINES:
1. For each change, clearly identify the specific clean code principle being applied
2. Ensure each change has a separate entry in codeSections
3. For each change, include both the original code and the improved version
4. Provide clear, educational explanations focused on teaching clean code principles
5. Make sure unchanged sections of code are properly included
6. Ensure the response is valid JSON with proper escaping of quotes and special characters

Focus specifically on these clean code principles:
${focusAreas.map(area => `- ${area}`).join('\n')}

Remember that your review will be displayed in a GitHub-style diff view, where each changed section can be expanded to show details and explanations. The goal is to teach clean code principles while providing actionable improvements.
`;
}

/**
 * Determines if a target area is relevant to the current chunk of code.
 */
function isAreaRelevantToChunk(
  area: { startLine: number; endLine: number; },
  code: string,
  options: CodeReviewOptions
): boolean {
  // If not a partial review, all areas are relevant
  if (!options.isPartialReview) {
    return true;
  }
  
  // If no chunk metadata, can't determine relevance
  if (!options.chunkContext) {
    return true;
  }
  
  // Extract chunk lines from context
  const lineMatch = options.chunkContext.match(/lines (\d+)-(\d+)/i);
  if (!lineMatch) {
    return true;
  }
  
  const chunkStart = parseInt(lineMatch[1], 10);
  const chunkEnd = parseInt(lineMatch[2], 10);
  
  // Check if there's overlap between the area and the chunk
  return (area.startLine <= chunkEnd && area.endLine >= chunkStart);
}

/**
 * Validates that the review response meets quality standards.
 * @param response - The review response to validate
 * @returns Boolean indicating if the response meets quality standards
 */
function validateReviewQuality(response: CodeReviewResponse): boolean {
  // Check if the response has all required fields
  if (!response.summary || !response.improvedCode) {
    return false;
  }
  
  // Check if the improved code is different from the original
  if (response.improvedCode.trim().length === 0) {
    return false;
  }
  
  // Check for at least some valid feedback
  const hasIssuesOrSuggestions = 
    (Array.isArray(response.issues) && response.issues.length > 0) ||
    (Array.isArray(response.suggestions) && response.suggestions.length > 0) ||
    (Array.isArray(response.codeSections) && response.codeSections.some(s => s.type === 'changed'));
  
  if (!hasIssuesOrSuggestions) {
    return false;
  }
  
  return true;
}

/**
 * Parses the Gemini API response, handling various response formats.
 * Enhanced with better JSON extraction and error handling.
 * @param responseText - Raw text response from Gemini API
 * @returns Parsed CodeReviewResponse object
 */
function parseReviewResponse(responseText: string): CodeReviewResponse {
  try {
    // First attempt: try to parse the entire response as JSON
    const parsed = JSON.parse(responseText);
    
    // Ensure codeSections exist or generate them if they don't
    if (!parsed.codeSections && parsed.suggestions && parsed.suggestions.length > 0) {
      parsed.codeSections = generateCodeSectionsFromSuggestions(parsed.suggestions);
    }
    
    // Ensure cleanCodePrinciples exists
    if (!parsed.cleanCodePrinciples && parsed.codeSections) {
      parsed.cleanCodePrinciples = generatePrinciplesFromSections(parsed.codeSections);
    }
    
    return parsed;
  } catch {
    // Second attempt: look for JSON object in the response
    try {
      // Find the JSON object using a more robust regex pattern
      const jsonMatch = responseText.match(/(\{[\s\S]*\})/g);
      if (jsonMatch) {
        // Try each match (in case there are multiple JSON-like structures)
        for (const match of jsonMatch) {
          try {
            const parsed = JSON.parse(match);
            
            // Process the parsed response to add missing sections if needed
            if (!parsed.codeSections && parsed.suggestions && parsed.suggestions.length > 0) {
              parsed.codeSections = generateCodeSectionsFromSuggestions(parsed.suggestions);
            }
            
            if (!parsed.cleanCodePrinciples && parsed.codeSections) {
              parsed.cleanCodePrinciples = generatePrinciplesFromSections(parsed.codeSections);
            }
            
            return parsed;
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
      
      // Fourth attempt: aggressive JSON repair
      return repairAndParseJSON(responseText);
    } catch (nestedError) {
      console.error('Error parsing JSON from matched pattern:', nestedError);
      throw new Error('Failed to parse valid JSON from the API response');
    }
  }
}

/**
 * Helper function to generate code sections from suggestions
 */
function generateCodeSectionsFromSuggestions(
  suggestions: Array<{description: string; before: string; after: string; benefits?: string}>
): CodeChangeSection[] {
  const sections: CodeChangeSection[] = [];
  
  suggestions.forEach((suggestion, index) => {
    sections.push({
      id: `generated-section-${index}`,
      type: 'changed' as 'unchanged' | 'changed',
      content: suggestion.after,
      original: suggestion.before,
      explanation: suggestion.description + (suggestion.benefits ? `\n\nBenefits: ${suggestion.benefits}` : ''),
      cleanCodePrinciple: getCategoryFromDescription(suggestion.description)
    });
  });
  
  return sections;
}

/**
 * Helper function to generate clean code principles count from sections
 */
function generatePrinciplesFromSections(codeSections: CodeChangeSection[]): {[key: string]: number} {
  const principles: {[key: string]: number} = {};
  
  codeSections.forEach(section => {
    if (section.type === 'changed' && section.cleanCodePrinciple) {
      principles[section.cleanCodePrinciple] = (principles[section.cleanCodePrinciple] || 0) + 1;
    }
  });
  
  return principles;
}

/**
 * Helper function to determine clean code principle from description
 */
function getCategoryFromDescription(description: string): string {
  // Map common terms to clean code principles
  const termToPrinciple: {[key: string]: string} = {
    'variable': 'Meaningful Names',
    'name': 'Meaningful Names',
    'naming': 'Meaningful Names',
    'function': 'Functions',
    'method': 'Functions',
    'decompos': 'Functions',
    'comment': 'Comments',
    'documentation': 'Comments',
    'format': 'Formatting',
    'indentation': 'Formatting',
    'spacing': 'Formatting',
    'align': 'Formatting',
    'error': 'Error Handling',
    'exception': 'Error Handling',
    'validation': 'Error Handling',
    'duplicate': 'Simplicity',
    'complexity': 'Simplicity',
    'simplify': 'Simplicity',
    'dry': 'Simplicity',
    'performance': 'Performance',
    'efficient': 'Performance',
    'security': 'Security',
    'vulnerability': 'Security',
    'sanitiz': 'Security'
  };
  
  // Check description for matching terms
  const lowerDescription = description.toLowerCase();
  for (const [term, principle] of Object.entries(termToPrinciple)) {
    if (lowerDescription.includes(term)) {
      return principle;
    }
  }
  
  // Default category
  return 'Code Improvement';
}

/**
 * Attempts to repair and parse malformed JSON in the API response
 * @param text - Raw API response text
 * @returns Parsed CodeReviewResponse object
 */
function repairAndParseJSON(text: string): CodeReviewResponse {
  // Extract key components that should be in the response
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]*)"/);
  const summary = summaryMatch ? summaryMatch[1] : "Unable to parse summary";
  
  // Create a minimal valid response
  const fallbackResponse: CodeReviewResponse = {
    summary,
    issues: [{
      type: "parsing",
      description: "The AI generated a response that couldn't be fully parsed.",
      severity: "medium",
      impact: "Please review the suggestions manually."
    }],
    suggestions: [{
      description: "Check response format",
      before: "Malformed JSON response",
      after: "Properly formatted JSON response",
      benefits: "Enables automated processing of review results"
    }],
    improvedCode: "" // Will be filled with original code by caller
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
  
  // Try to extract suggestions array
  try {
    const suggestionsMatch = text.match(/"suggestions"\s*:\s*(\[[\s\S]*?\])/);
    if (suggestionsMatch) {
      const suggestionsJson = suggestionsMatch[1].replace(/'/g, '"');
      const suggestions = JSON.parse(suggestionsJson);
      if (Array.isArray(suggestions)) {
        fallbackResponse.suggestions = suggestions;
        
        // Generate code sections from suggestions
        fallbackResponse.codeSections = generateCodeSectionsFromSuggestions(suggestions);
      }
    }
  } catch {
    // Keep default suggestions
  }
  
  // Try to extract code sections array
  try {
    const codeSectionsMatch = text.match(/"codeSections"\s*:\s*(\[[\s\S]*?\])/);
    if (codeSectionsMatch) {
      const codeSectionsJson = codeSectionsMatch[1].replace(/'/g, '"');
      const codeSections = JSON.parse(codeSectionsJson);
      if (Array.isArray(codeSections)) {
        fallbackResponse.codeSections = codeSections;
      }
    }
  } catch {
    // Keep default code sections
  }
  
  // Try to extract improved code
  try {
    // This is tricky because the code itself might contain quotes and special chars
    // A simple approach is used here, but could be improved
    const codeMatch = text.match(/"improvedCode"\s*:\s*"([\s\S]*?)"\s*,\s*"(learningResources|seniorReviewTime|codeSections)/);
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
 * Sends code to Gemini API for review and returns structured feedback.
 * Enhanced with preliminary analysis for better context-awareness.
 * 
 * @param code - Code to be reviewed
 * @param language - Programming language of the code
 * @param options - Review options
 * @returns Structured code review response
 */
export async function reviewCode(
  code: string, 
  language: string,
  options: CodeReviewOptions = {}
): Promise<CodeReviewResponse> {
  // Perform preliminary analysis if not provided and not a chunk review
  let reviewMap = options.reviewMap;
  if (!reviewMap && !options.isPartialReview) {
    try {
      reviewMap = await performPreliminaryAnalysis(code, language, options);
    } catch (error) {
      console.warn('Preliminary analysis failed, proceeding with standard review:', error);
      // Continue without preliminary analysis
    }
  }
  
  // Add the review map to options
  const enhancedOptions = {
    ...options,
    reviewMap
  };
  
  const { model } = initGeminiApi();
  const prompt = createCodeReviewPrompt(code, language, enhancedOptions);
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
        const response = parseReviewResponse(responseText);
        
        // Ensure improvedCode is populated
        if (!response.improvedCode || response.improvedCode.trim().length === 0) {
          response.improvedCode = code;
        }
        
        // Add the review map for context
        response.reviewMap = reviewMap;
        
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
        
        // Validate the quality of the review
        if (!validateReviewQuality(response)) {
          if (attempts < maxRetries) {
            attempts++;
            continue; // Try again
          } else {
            // On last attempt, try repair approach
            return await repairReview(chatSession, code, enhancedOptions);
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
          return await repairReview(chatSession, code, enhancedOptions);
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
        throw new Error(`Failed to get code review after ${maxRetries + 1} attempts: ${lastError?.message}`);
      }
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw new Error(`Failed to get code review: ${lastError?.message}`);
}

/**
 * Retries the code review with more explicit formatting instructions.
 * @param chatSession - Active chat session
 * @param code - Code to be reviewed
 * @param options - Review options
 * @returns Structured code review response
 */
async function repairReview(
  chatSession: ChatSession, 
  code: string,
  options: CodeReviewOptions = {}
): Promise<CodeReviewResponse> {
  const retryPrompt = `
Your previous response couldn't be properly parsed as JSON. Please review the code again and respond ONLY with a valid JSON object.

The response must be a VALID JSON object with this structure:
{
  "summary": "string",
  "codeSections": [
    {
      "id": "string",
      "type": "unchanged|changed",
      "content": "string",
      "original": "string (only for changed sections)",
      "explanation": "string (only for changed sections)",
      "cleanCodePrinciple": "string (only for changed sections)",
      "lineNumbers": "string (e.g., '10-15' or '7')"
    }
  ],
  "cleanCodePrinciples": {
    "Principle Name": number
  },
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
  "improvedCode": "string"
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
      const response = parseReviewResponse(responseText);
      
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
      
      // Add review map
      response.reviewMap = options.reviewMap;
      
      return response;
    } catch (parseError) {
      console.error('Error parsing JSON in retry response:', parseError);
      
      // One more attempt with even stricter instructions
      return await lastChanceReview(chatSession, code, options);
    }
  } catch (retryError) {
    console.error('Error in retry review:', retryError);
    return createFallbackResponse(code, options);
  }
}

/**
 * Last attempt to get a valid JSON response from the model.
 * @param chatSession - Active chat session
 * @param code - Original code being reviewed
 * @param options - Review options
 * @returns Structured code review response
 */
async function lastChanceReview(
  chatSession: ChatSession, 
  code: string,
  options: CodeReviewOptions = {}
): Promise<CodeReviewResponse> {
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
      const response = parseReviewResponse(responseText);
      
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
      
      // Add review map
      response.reviewMap = options.reviewMap;
      
      return response;
    } catch (finalError) {
      console.error('Final attempt failed to parse JSON:', finalError);
      return createFallbackResponse(code, options);
    }
  } catch (lastAttemptError) {
    console.error('Error in final review attempt:', lastAttemptError);
    return createFallbackResponse(code, options);
  }
}

/**
 * Creates a fallback response when all attempts to get a valid review fail.
 * @param code - Original code being reviewed
 * @param options - Review options
 * @returns Basic code review response
 */
function createFallbackResponse(
  code: string,
  options: CodeReviewOptions = {}
): CodeReviewResponse {
  const response: CodeReviewResponse = {
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
    codeSections: [
      {
        id: "fallback-section",
        type: "unchanged",
        content: code
      }
    ],
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
    },
    cleanCodePrinciples: {
      "General Code Quality": 1
    },
    reviewMap: options.reviewMap
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
 * Reviews a specific chunk of code with context awareness.
 * Enhanced with full codebase context from preliminary analysis.
 * 
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
  
  // Perform the review with chunk context
  return reviewCode(chunk.code, chunk.language, {
    ...options,
    chunkContext,
    isPartialReview: true,
    maxRetries: 2 // More retries for chunk processing
  });
}

/**
 * Streams code review results from Gemini API.
 * Enhanced to support chunked processing.
 * @param code - Code to be reviewed
 * @param language - Programming language of the code
 * @param options - Review options
 * @returns ReadableStream of Server-Sent Events
 */
export async function reviewCodeStream(
  code: string,
  language: string,
  options: CodeReviewOptions = {}
): Promise<ReadableStream> {
  // Perform preliminary analysis first, if not already in options
  let reviewMap = options.reviewMap;
  if (!reviewMap) {
    try {
      console.log('Performing preliminary analysis for streaming review...');
      reviewMap = await performPreliminaryAnalysis(code, language, options);
    } catch (error) {
      console.warn('Preliminary analysis failed for streaming review:', error);
      // Continue without preliminary analysis
    }
  }
  
  // Add review map to options
  const enhancedOptions = {
    ...options,
    reviewMap
  };
  
  const { model } = initGeminiApi();
  const prompt = createCodeReviewPrompt(code, language, enhancedOptions);
  
  // Create encoder for text encoding
  const encoder = new TextEncoder();
  
  // Initialize response structure with placeholders
  const initialResponse: Partial<CodeReviewResponse> = {
    summary: "",
    issues: [],
    suggestions: [],
    codeSections: [],
    improvedCode: "",
    learningResources: [],
    seniorReviewTime: {
      before: "",
      after: "",
      timeSaved: ""
    }
  };
  
  // Create a stream for the response
  return new ReadableStream({
    async start(controller) {
      try {
        // Send initial state event
        controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ status: 'analyzing', progress: 0 })}\n\n`));
        
        // If we have a review map from preliminary analysis, send it
        if (reviewMap) {
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ 
            status: 'analyzing', 
            progress: 5,
            message: 'Preliminary analysis completed. Starting detailed review...' 
          })}\n\n`));
        }
        
        // Initialize Gemini chat session
        const chatSession = model.startChat({ history: [] });
        
        // Start streaming response from Gemini
        const streamResult = await chatSession.sendMessageStream(prompt);
        
        // Track accumulated text for JSON parsing
        let accumulatedText = "";
        let currentResponse = { ...initialResponse };
        const lastSent = { ...initialResponse };
        let progress = 10; // Start at 10% after initialization
        
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
                const parsedJson = JSON.parse(potentialJson);
                
                // Update current response with parsed data
                currentResponse = { ...currentResponse, ...parsedJson };
                
                // Calculate progress
                progress = Math.min(90, progress + 5); // Cap at 90% until complete
                
                // Determine what parts have been updated
                const updates: Record<string, unknown> = {};
                
                // Check each key to see what's changed since last sent
                for (const key of Object.keys(currentResponse) as Array<keyof typeof currentResponse>) {
                  if (key && currentResponse[key] !== lastSent[key as keyof typeof lastSent]) {
                    if (Array.isArray(currentResponse[key]) && 
                        Array.isArray(lastSent[key as keyof typeof lastSent]) && 
                        (currentResponse[key] as unknown[]).length > (lastSent[key as keyof typeof lastSent] as unknown[]).length) {
                      // For arrays, send only if there are new items
                      updates[key] = currentResponse[key];
                      const typedKey = key as keyof typeof lastSent;
                      lastSent[typedKey] = JSON.parse(JSON.stringify(currentResponse[key]));
                    } else if (!Array.isArray(currentResponse[key])) {
                      // For non-arrays, send if the value has changed
                      updates[key] = currentResponse[key];
                      const typedKey = key as keyof typeof lastSent;
                      lastSent[typedKey] = JSON.parse(JSON.stringify(currentResponse[key]));
                    }
                  }
                }
                
                // Send progress update
                controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ status: 'analyzing', progress })}\n\n`));
                
                // Send partial response if there are updates
                if (Object.keys(updates).length > 0) {
                  controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(updates)}\n\n`));
                }
              } catch {
                // JSON parsing failed, continue accumulating
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
          const finalResponse = parseReviewResponse(responseText);
          
          // Ensure improvedCode is populated
          if (!finalResponse.improvedCode || finalResponse.improvedCode.trim().length === 0) {
            finalResponse.improvedCode = code;
          }
          
          // Add review map to response
          finalResponse.reviewMap = reviewMap;
          
          // Ensure codeSections exist
          if (!finalResponse.codeSections && finalResponse.suggestions) {
            finalResponse.codeSections = generateCodeSectionsFromSuggestions(finalResponse.suggestions);
          }
          
          // Validate the quality of the review and retry if needed
          const validatedResponse = validateReviewQuality(finalResponse) 
            ? finalResponse 
            : await repairReview(chatSession, code, enhancedOptions);
          
          // Send completion event with full response
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ status: 'completed', progress: 100 })}\n\n`));
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(validatedResponse)}\n\n`));
        } catch (error) {
          // If parsing fails at the end, try the retry mechanisms
          console.error('Error parsing final JSON response:', error);
          const retryResponse = await repairReview(chatSession, code, enhancedOptions);
          
          // Send the retry response
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ status: 'completed', progress: 100 })}\n\n`));
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(retryResponse)}\n\n`));
        }
        
        // Close the stream
        controller.close();
      } catch (error) {
        // Handle errors
        console.error('Streaming error:', error);
        
        // Create fallback response
        const fallbackResponse = createFallbackResponse(code, enhancedOptions);
        
        // Send error event
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ 
          message: error instanceof Error ? error.message : 'Unknown error during code review' 
        })}\n\n`));
        
        // Send fallback response
        controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(fallbackResponse)}\n\n`));
        
        // Close the stream
        controller.close();
      }
    }
  });
}