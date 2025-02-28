/**
 * Enhanced code chunking module for distributed code review.
 * Provides functionality to divide code into logical chunks while maintaining context.
 * Prevents splitting comments into separate chunks and preserves code structure.
 */

// Define the structure for a code chunk
export interface CodeChunk {
  id: string;
  code: string;
  language: string;
  startLine: number;
  endLine: number;
  context?: {
    imports?: string[];
    declarations?: string[];
    dependencies?: string[];
  };
  metadata?: Record<string, unknown>;
}

// Options for chunking strategies
export interface ChunkerOptions {
  maxChunkSize?: number;
  minChunkSize?: number;
  overlapPercentage?: number;
  preserveImports?: boolean;
  smartChunking?: boolean;
  preventCommentOnlyChunks?: boolean;
}

// Structure representing a logical code unit (function, class, etc.)
export interface CodeStructure {
  type: 'function' | 'class' | 'component' | 'block' | 'namespace' | 'interface' | 'unknown';
  name?: string;
  startLine: number;
  endLine: number;
  code: string;
  isExported?: boolean;
}

// Default options
const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChunkSize: 1000, // Max lines per chunk
  minChunkSize: 50,   // Min lines per chunk
  overlapPercentage: 15, // Increased overlap between chunks for better context
  preserveImports: true, // Include import statements in each chunk
  smartChunking: true,   // Use language-specific chunking
  preventCommentOnlyChunks: true, // Prevent chunks with only comments
};

/**
 * Main chunking function that divides code into logical chunks
 * Enhanced to preserve context and prevent comment-only chunks
 * 
 * @param code - The full code to be chunked
 * @param language - Programming language of the code
 * @param options - Chunking options
 * @returns Array of code chunks
 */
export function chunkCode(
  code: string,
  language: string,
  options: ChunkerOptions = {}
): CodeChunk[] {
  // Merge default options with provided options and ensure all properties are defined
  const finalOptions: Required<ChunkerOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  
  // Convert code to lines for processing
  const lines = code.split('\n');
  
  // If code is smaller than minChunkSize, return as a single chunk
  if (lines.length <= finalOptions.minChunkSize) {
    return [{
      id: generateChunkId(),
      code,
      language,
      startLine: 0,
      endLine: lines.length - 1,
    }];
  }
  
  // Choose appropriate chunking strategy based on language and options
  let chunks: CodeChunk[];
  
  if (finalOptions.smartChunking) {
    switch (language) {
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        chunks = chunkJavaScriptLike(code, language, finalOptions);
        break;
      case 'python':
        chunks = chunkPython(code, language, finalOptions);
        break;
      case 'java':
      case 'kotlin':
      case 'csharp':
      case 'cpp':
      case 'c':
      case 'go':
        chunks = chunkCStyleLanguage(code, language, finalOptions);
        break;
      default:
        // Fall back to enhanced generic chunking for unsupported languages
        chunks = enhancedChunkGeneric(code, language, finalOptions);
    }
  } else {
    // Use enhanced generic chunking if smart chunking is disabled
    chunks = enhancedChunkGeneric(code, language, finalOptions);
  }
  
  // Post-process chunks to improve quality if option is enabled
  if (finalOptions.preventCommentOnlyChunks) {
    chunks = improveChunks(chunks, language);
  }
  
  return chunks;
}

/**
 * Enhanced generic chunking strategy that divides code into chunks while
 * preserving context and avoiding splitting comments
 */
function enhancedChunkGeneric(
  code: string,
  language: string,
  options: Required<ChunkerOptions>
): CodeChunk[] {
  const lines = code.split('\n');
  const chunks: CodeChunk[] = [];
  
  // Determine imports and declarations for context preservation
  const imports = options.preserveImports ? extractImports(code, language) : [];
  const declarations = extractDeclarations(code, language);
  
  // Calculate chunk size based on maxChunkSize
  const effectiveChunkSize = Math.min(options.maxChunkSize, Math.max(options.minChunkSize, 
    Math.ceil(lines.length / Math.ceil(lines.length / options.maxChunkSize))));
  
  // Calculate overlap
  const overlap = Math.floor(effectiveChunkSize * (options.overlapPercentage / 100));
  
  // Maps to track comment blocks for better chunking
  const lineCommentState = analyzeCommentState(lines, language);
  
  // Create chunks with overlap
  let startLine = 0;
  while (startLine < lines.length) {
    // Calculate tentative end line
    let endLine = Math.min(startLine + effectiveChunkSize - 1, lines.length - 1);
    
    // Adjust endLine to avoid breaking in the middle of a comment block
    if (endLine < lines.length - 1) {
      // First check if we're in a comment block
      if (lineCommentState[endLine].inComment) {
        // Find the end of the comment block
        for (let i = endLine + 1; i < lines.length; i++) {
          if (!lineCommentState[i].inComment) {
            endLine = i;
            break;
          }
          // Limit how far we look to avoid overly large chunks
          if (i - endLine > Math.min(50, effectiveChunkSize / 2)) {
            break;
          }
        }
      }
      
      // Now check for other safe break points
      const safeBreakAdjustment = findSafeBreakPoint(lines, endLine, language, lineCommentState);
      endLine = Math.min(endLine + safeBreakAdjustment, lines.length - 1);
    }
    
    // Extract the chunk code
    let chunkCode = lines.slice(startLine, endLine + 1).join('\n');
    
    // Add imports to the beginning of the chunk if needed
    if (options.preserveImports && imports.length > 0) {
      // Add imports only if they're not already in the chunk
      const existingImports = extractImports(chunkCode, language);
      const missingImports = imports.filter(imp => !existingImports.includes(imp));
      
      if (missingImports.length > 0) {
        chunkCode = missingImports.join('\n') + '\n\n' + chunkCode;
      }
    }
    
    // Get relevant declarations for this chunk
    const relevantDeclarations = getRelevantDeclarations(
      chunkCode, 
      language, 
      declarations
    );
    
    // Create the chunk with enhanced metadata
    chunks.push({
      id: generateChunkId(),
      code: chunkCode,
      language,
      startLine,
      endLine,
      context: {
        imports: imports.length > 0 ? imports : undefined,
        declarations: relevantDeclarations.length > 0 ? relevantDeclarations : undefined,
      },
      metadata: {
        chunkNumber: chunks.length + 1,
        totalLines: endLine - startLine + 1,
        commentRatio: calculateCommentRatio(chunkCode, language),
        hasCompleteStructures: detectCompleteStructures(chunkCode, language)
      }
    });
    
    // Move to the next chunk with overlap
    startLine = endLine + 1 - overlap;
    
    // Break if we've reached the end
    if (startLine >= lines.length) {
      break;
    }
  }
  
  return chunks;
}

/**
 * Analyzes each line to determine whether it's part of a comment block
 * Returns an array where each element indicates the comment state of the corresponding line
 */
function analyzeCommentState(
  lines: string[], 
  language: string
): Array<{inComment: boolean, commentType?: string}> {
  const result: Array<{inComment: boolean, commentType?: string}> = [];
  
  // Initialize state
  let inBlockComment = false;
  let inPythonDocstring = false;
  let blockCommentType = '';
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for language-specific comment patterns
    if (language === 'javascript' || 
        language === 'typescript' || 
        language === 'jsx' || 
        language === 'tsx' || 
        language === 'java' || 
        language === 'csharp' || 
        language === 'cpp' ||
        language === 'c' ||
        language === 'go' ||
        language === 'css') {
      
      // Check single-line comments
      if (!inBlockComment && (line.startsWith('//') || line === '')) {
        result.push({
          inComment: line.startsWith('//'),
          commentType: line.startsWith('//') ? 'line' : undefined
        });
        continue;
      }
      
      // Check block comment start
      if (!inBlockComment && line.includes('/*')) {
        inBlockComment = true;
        blockCommentType = 'block';
        
        // Special handling for JSDoc-style comments
        if (line.startsWith('/**')) {
          blockCommentType = 'jsdoc';
        }
      }
      
      // Check block comment end
      if (inBlockComment && line.includes('*/')) {
        inBlockComment = false;
        result.push({
          inComment: true,
          commentType: blockCommentType
        });
        continue;
      }
      
      // Inside a block comment
      if (inBlockComment) {
        result.push({
          inComment: true,
          commentType: blockCommentType
        });
        continue;
      }
      
    } else if (language === 'python' || language === 'ruby') {
      // Handle Python/Ruby comments
      
      // Single line comments
      if (!inPythonDocstring && (line.startsWith('#') || line === '')) {
        result.push({
          inComment: line.startsWith('#'),
          commentType: line.startsWith('#') ? 'line' : undefined
        });
        continue;
      }
      
      // Check for docstring start/end with triple quotes
      const tripleDoubleCount = (line.match(/"""/g) || []).length;
      const tripleSingleCount = (line.match(/'''/g) || []).length;
      
      if (!inPythonDocstring && (line.startsWith('"""') || line.startsWith("'''"))) {
        inPythonDocstring = true;
        
        // Check if docstring ends on the same line
        if ((tripleDoubleCount === 2 && line.startsWith('"""')) || 
            (tripleSingleCount === 2 && line.startsWith("'''"))) {
          inPythonDocstring = false;
        }
        
        result.push({
          inComment: true,
          commentType: 'docstring'
        });
        continue;
      }
      
      // Check for docstring end
      if (inPythonDocstring && 
          ((tripleDoubleCount === 1 && !line.startsWith('"""')) || 
           (tripleSingleCount === 1 && !line.startsWith("'''")))) {
        inPythonDocstring = false;
        result.push({
          inComment: true,
          commentType: 'docstring'
        });
        continue;
      }
      
      // Inside a docstring
      if (inPythonDocstring) {
        result.push({
          inComment: true,
          commentType: 'docstring'
        });
        continue;
      }
    }
    
    // If none of the above, it's a normal code line
    result.push({
      inComment: false
    });
  }
  
  return result;
}

/**
 * Find a safe point to break a chunk, considering code structure and comments
 */
function findSafeBreakPoint(
  lines: string[], 
  currentLine: number, 
  language: string,
  commentState: Array<{inComment: boolean, commentType?: string}>
): number {
  const MAX_LOOKAHEAD = 20;
  
  // Never break in the middle of a comment block
  if (commentState[currentLine].inComment) {
    // Find the end of the comment block
    for (let i = 1; i < MAX_LOOKAHEAD && currentLine + i < lines.length; i++) {
      if (!commentState[currentLine + i].inComment) {
        return i;
      }
    }
    return 0; // Can't find a good break point
  }
  
  // Look for good breaking points
  for (let i = 0; i < MAX_LOOKAHEAD && currentLine + i < lines.length; i++) {
    const line = lines[currentLine + i].trim();
    
    // Empty line is a good break point if not followed by a comment
    if (line === '') {
      // Check if next line is a comment - if so, keep going
      if (currentLine + i + 1 < lines.length) {
        const nextLine = lines[currentLine + i + 1].trim();
        if (commentState[currentLine + i + 1].inComment && i < MAX_LOOKAHEAD - 1) {
          continue;
        }
      }
      return i;
    }
    
    // Language-specific good break points
    if (language === 'javascript' || 
        language === 'typescript' || 
        language === 'jsx' || 
        language === 'tsx' || 
        language === 'java' || 
        language === 'csharp' || 
        language === 'cpp' || 
        language === 'c' ||
        language === 'go') {
      
      // End of a block is a good break point
      if (line === '}' || line === '};') {
        return i;
      }
      
      // End of a statement might be ok
      if (line.endsWith(';') && !commentState[currentLine + i].inComment) {
        return i;
      }
      
      // Function or class declaration
      if ((line.includes('function ') || line.includes('class ')) && i > 0) {
        return i;
      }
    } else if (language === 'python') {
      // Function or class definition in Python
      if ((line.startsWith('def ') || line.startsWith('class ')) && i > 0) {
        return i;
      }
      
      // End of a control flow block
      if (line.startsWith('return ') || line === 'pass' || line.startsWith('raise ')) {
        return i;
      }
    }
  }
  
  // If no good break point found, suggest modest adjustment to avoid mid-statement breaks
  return Math.min(3, MAX_LOOKAHEAD);
}

/**
 * JavaScript/TypeScript specific chunking strategy
 */
function chunkJavaScriptLike(
  code: string,
  language: string,
  options: Required<ChunkerOptions>
): CodeChunk[] {
  // Get imports and top-level declarations
  const imports = extractImports(code, language);
  const declarations = extractDeclarations(code, language);
  
  // First do a rough parse to identify top-level structures
  const structures = identifyJSStructures(code);
  
  // If smart chunking couldn't identify structures, fall back to generic
  if (structures.length === 0) {
    return enhancedChunkGeneric(code, language, options);
  }
  
  // Group structures into chunks based on size constraints
  return createChunksFromStructures(
    code,
    language,
    structures,
    imports,
    declarations,
    options
  );
}

/**
 * Python specific chunking strategy with indentation awareness
 */
function chunkPython(
  code: string,
  language: string,
  options: Required<ChunkerOptions>
): CodeChunk[] {
  // Extract imports and function/class declarations
  const imports = extractImports(code, language);
  const declarations = extractDeclarations(code, language);
  
  // Identify Python structures (classes, functions)
  const structures = identifyPythonStructures(code);
  
  // If smart chunking couldn't identify structures, use enhanced generic
  if (structures.length === 0) {
    return enhancedChunkGeneric(code, language, options);
  }
  
  // Group structures into chunks based on size constraints
  return createChunksFromStructures(
    code,
    language,
    structures,
    imports,
    declarations,
    options
  );
}

/**
 * C-style language chunking strategy with brace balancing
 */
function chunkCStyleLanguage(
  code: string,
  language: string,
  options: Required<ChunkerOptions>
): CodeChunk[] {
  // Extract imports and declarations
  const imports = extractImports(code, language);
  const declarations = extractDeclarations(code, language);
  
  // Identify C-style structures (classes, functions, namespaces)
  const structures = identifyCStyleStructures(code, language);
  
  // If smart chunking couldn't identify structures, use enhanced generic
  if (structures.length === 0) {
    return enhancedChunkGeneric(code, language, options);
  }
  
  // Group structures into chunks based on size constraints
  return createChunksFromStructures(
    code,
    language,
    structures,
    imports,
    declarations,
    options
  );
}

/**
 * Post-process chunks to improve quality and prevent comment-only chunks
 */
function improveChunks(
  chunks: CodeChunk[], 
  language: string,
  minCodeRatio: number = 0.2
): CodeChunk[] {
  if (chunks.length <= 1) return chunks;
  
  const improvedChunks: CodeChunk[] = [];
  let currentChunk: CodeChunk | null = null;
  
  for (const chunk of chunks) {
    // Calculate the code-to-comment ratio
    const ratio = calculateCommentRatio(chunk.code, language);
    const codeRatio = 1 - ratio;
    
    // If this chunk has too few code lines and we have a current chunk, merge them
    if (codeRatio < minCodeRatio && currentChunk) {
      // Merge with the current chunk
      currentChunk = {
        ...(currentChunk as CodeChunk),
        code: currentChunk.code + '\n' + chunk.code,
        endLine: chunk.endLine,
        // Merge context if available
        context: {
          imports: [...(currentChunk.context?.imports || []), ...(chunk.context?.imports || [])].filter(
            (item, index, self) => self.indexOf(item) === index // Remove duplicates
          ),
          declarations: [...(currentChunk.context?.declarations || []), ...(chunk.context?.declarations || [])].filter(
            (item, index, self) => self.indexOf(item) === index
          ),
          dependencies: [...(currentChunk.context?.dependencies || []), ...(chunk.context?.dependencies || [])].filter(
            (item, index, self) => self.indexOf(item) === index
          ),
        },
        // Update metadata
        metadata: {
          ...((currentChunk.metadata as Record<string, unknown>) || {}),
          totalLines: (currentChunk.endLine - currentChunk.startLine + 1) + 
                      (chunk.endLine - chunk.startLine + 1),
          commentRatio: calculateCommentRatio(
            currentChunk.code + '\n' + chunk.code, 
            language
          )
        }
      };
    }
    // Otherwise, create a new chunk
    else {
      if (currentChunk) {
        improvedChunks.push(currentChunk);
      }
      currentChunk = chunk;
    }
  }
  
  // Add the last chunk
  if (currentChunk) {
    improvedChunks.push(currentChunk);
  }
  
  return improvedChunks;
}

/**
 * Calculate the ratio of comments to total code in a chunk
 * Returns a value between 0 (no comments) and 1 (all comments)
 */
function calculateCommentRatio(code: string, language: string): number {
  const lines = code.split('\n');
  let commentLines = 0;
  let blankLines = 0;
  let inMultiLineComment = false;
  let inPythonDocstring = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip blank lines
    if (line === '') {
      blankLines++;
      continue;
    }
    
    // Handle C-style languages
    if (language === 'javascript' || 
        language === 'typescript' || 
        language === 'jsx' || 
        language === 'tsx' || 
        language === 'java' || 
        language === 'csharp' || 
        language === 'cpp' ||
        language === 'c' ||
        language === 'go' ||
        language === 'css') {
      
      // Single-line comment
      if (line.startsWith('//')) {
        commentLines++;
        continue;
      }
      
      // Start of block comment
      if (!inMultiLineComment && line.includes('/*')) {
        inMultiLineComment = true;
        // Check if it ends on the same line
        if (line.includes('*/') && line.lastIndexOf('*/') > line.lastIndexOf('/*')) {
          inMultiLineComment = false;
        }
        commentLines++;
        continue;
      }
      
      // End of block comment
      if (inMultiLineComment) {
        commentLines++;
        if (line.includes('*/')) {
          inMultiLineComment = false;
        }
        continue;
      }
    }
    // Handle Python/Ruby
    else if (language === 'python' || language === 'ruby') {
      // Single-line comment
      if (line.startsWith('#')) {
        commentLines++;
        continue;
      }
      
      // Check for Python docstrings
      if (!inPythonDocstring && (line.startsWith('"""') || line.startsWith("'''"))) {
        inPythonDocstring = true;
        
        // Check if it ends on the same line
        const tripleDoubleCount = (line.match(/"""/g) || []).length;
        const tripleSingleCount = (line.match(/'''/g) || []).length;
        
        if ((tripleDoubleCount === 2 && line.startsWith('"""')) || 
            (tripleSingleCount === 2 && line.startsWith("'''"))) {
          inPythonDocstring = false;
        }
        
        commentLines++;
        continue;
      }
      
      // Inside Python docstring
      if (inPythonDocstring) {
        commentLines++;
        
        // Check for docstring end
        const tripleDoubleCount = (line.match(/"""/g) || []).length;
        const tripleSingleCount = (line.match(/'''/g) || []).length;
        
        if (tripleDoubleCount === 1 || tripleSingleCount === 1) {
          inPythonDocstring = false;
        }
        
        continue;
      }
    }
  }
  
  // Calculate ratio
  const totalNonBlankLines = lines.length - blankLines;
  if (totalNonBlankLines === 0) return 0;
  
  return commentLines / totalNonBlankLines;
}

/**
 * Detect whether a chunk contains complete code structures
 */
function detectCompleteStructures(code: string, language: string): boolean {
  // Simplified implementation - just check balance of common delimiters
  const bracePairs = {
    '{': '}',
    '(': ')',
    '[': ']'
  };
  
  const stack: string[] = [];
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let commentType = '';
  
  const chars = code.split('');
  
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = i < chars.length - 1 ? chars[i + 1] : '';
    
    // Skip comments
    if (!inComment && !inString) {
      // Start of line comment
      if (char === '/' && nextChar === '/') {
        inComment = true;
        commentType = 'line';
        continue;
      }
      // Start of block comment
      else if (char === '/' && nextChar === '*') {
        inComment = true;
        commentType = 'block';
        continue;
      }
      // Start of Python comment
      else if (language === 'python' && char === '#') {
        inComment = true;
        commentType = 'line';
        continue;
      }
    }
    
    // End of comments
    if (inComment) {
      if (commentType === 'line' && char === '\n') {
        inComment = false;
      } else if (commentType === 'block' && char === '*' && nextChar === '/') {
        inComment = false;
        i++; // Skip the '/' character
      }
      continue;
    }
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || 
                      (language === 'python' && char === '"' && nextChar === '"' && chars[i+2] === '"') ||
                      (language === 'python' && char === "'" && nextChar === "'" && chars[i+2] === "'"))) {
      inString = true;
      stringChar = char;
      // Skip triple quotes in Python
      if (language === 'python' && ((char === '"' && nextChar === '"' && chars[i+2] === '"') ||
                                    (char === "'" && nextChar === "'" && chars[i+2] === "'"))) {
        stringChar = char.repeat(3);
        i += 2;
      }
      continue;
    }
    
    // End of string
    if (inString) {
      if (stringChar.length === 1 && char === stringChar) {
        inString = false;
      } else if (stringChar.length === 3 && 
                char === stringChar[0] && 
                nextChar === stringChar[0] && 
                i < chars.length - 2 && 
                chars[i+2] === stringChar[0]) {
        inString = false;
        i += 2;
      }
      continue;
    }
    
    // Track brackets/braces
    if (bracePairs[char as keyof typeof bracePairs]) {
      stack.push(char);
    } else if (Object.values(bracePairs).includes(char)) {
      const expected = stack.pop();
      const expectedClose = expected ? bracePairs[expected as keyof typeof bracePairs] : null;
      if (expectedClose !== char) {
        // Unbalanced delimiter
        return false;
      }
    }
  }
  
  // If stack is empty, all delimiters are balanced
  return stack.length === 0;
}

/**
 * Extract import statements from code
 */
function extractImports(code: string, language: string): string[] {
  const imports: string[] = [];
  const lines = code.split('\n');
  
  // Different regex patterns for different languages
  let importPattern: RegExp;
  
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      importPattern = /^import\s+.+\s+from\s+['"]|^const\s+.*\s*=\s*require\(/;
      break;
    case 'python':
      importPattern = /^import\s+|^from\s+\w+\s+import/;
      break;
    case 'java':
    case 'kotlin':
      importPattern = /^import\s+[\w.]+;/;
      break;
    case 'csharp':
      importPattern = /^using\s+[\w.]+;/;
      break;
    case 'cpp':
    case 'c':
      importPattern = /^#include\s+[<"][\w.\/]+[>"]/;
      break;
    case 'go':
      importPattern = /^import\s+\(|^import\s+["']/;
      break;
    default:
      importPattern = /^import\s+|^using\s+|^#include\s+/;
  }
  
  let inMultilineImport = false;
  let importBlock = '';
  
  // Find all import lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle multi-line imports in Go
    if (language === 'go' && line === 'import (') {
      inMultilineImport = true;
      importBlock = line;
      continue;
    }
    
    if (inMultilineImport) {
      importBlock += '\n' + lines[i];
      if (line === ')') {
        inMultilineImport = false;
        imports.push(importBlock);
      }
      continue;
    }
    
    if (importPattern.test(line)) {
      imports.push(lines[i]);
    }
  }
  
  return imports;
}

/**
 * Extract top-level declarations (functions, classes, etc.)
 */
function extractDeclarations(code: string, language: string): string[] {
  const declarations: string[] = [];
  const lines = code.split('\n');
  
  // Different patterns for different languages
  let declarationPattern: RegExp;
  
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      declarationPattern = /^(const|let|var|function|class|interface)\s+\w+|^export\s+(const|let|var|function|class|interface|default)/;
      break;
    case 'python':
      declarationPattern = /^(def|class)\s+\w+/;
      break;
    case 'java':
    case 'kotlin':
      declarationPattern = /^(public|private|protected|class|interface|enum)\s+\w+/;
      break;
    case 'csharp':
      declarationPattern = /^(public|private|protected|internal|class|interface|enum|struct)\s+\w+/;
      break;
    case 'cpp':
    case 'c':
      declarationPattern = /^(class|struct|enum|union|typedef|namespace)\s+\w+|^(\w+)\s+\w+\s*\(/;
      break;
    case 'go':
      declarationPattern = /^(func|type|var|const)\s+\w+/;
      break;
    default:
      declarationPattern = /^(function|class)\s+\w+/;
  }
  
  // Find declaration lines
  // This is fairly simple and doesn't account for multi-line declarations
  // A more robust implementation would use AST parsing
  for (const line of lines) {
    const trimmed = line.trim();
    if (declarationPattern.test(trimmed)) {
      declarations.push(line);
    }
  }
  
  return declarations;
}

/**
 * Identify logical structures in JavaScript/TypeScript code
 */
function identifyJSStructures(code: string): CodeStructure[] {
  const structures: CodeStructure[] = [];
  const lines = code.split('\n');
  
  // Very simplified parser - a real implementation would use an AST parser
  let currentStructure: Partial<CodeStructure> | null = null;
  let braceCount = 0;
  let inString = false;
  let inComment = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (line === '') continue;
    
    // Skip comments
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      inComment = true;
      if (line.includes('*/')) {
        inComment = false;
      }
      continue;
    }
    if (inComment) {
      if (line.includes('*/')) {
        inComment = false;
      }
      continue;
    }
    
    // Look for structure starts if not in a structure
    if (currentStructure === null) {
      let match: RegExpMatchArray | null;
      
      // Function declaration
      if ((match = line.match(/^(export\s+)?(async\s+)?(function\s+(\w+)|\w+\s*=\s*(async\s+)?function\s*\()/))) {
        currentStructure = {
          type: 'function',
          name: match[4] || 'anonymous',
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
      // Arrow function
      else if ((match = line.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/))) {
        currentStructure = {
          type: 'function',
          name: match[3],
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
      // Class declaration
      else if ((match = line.match(/^(export\s+)?class\s+(\w+)/))) {
        currentStructure = {
          type: 'class',
          name: match[2],
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
      // React component (function)
      else if ((match = line.match(/^(export\s+)?(const\s+(\w+)\s*=\s*\([^)]*\)\s*=>)/))) {
        currentStructure = {
          type: 'component',
          name: match[3],
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
      // React function component
      else if ((match = line.match(/^(export\s+)?function\s+(\w+)\s*\(\s*(?:props|{[^}]*})\s*\)/)) && 
               line.includes('return') && (line.includes('jsx') || line.includes('<'))) {
        currentStructure = {
          type: 'component',
          name: match[2],
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
      // Interface or type declaration
      else if ((match = line.match(/^(export\s+)?(interface|type)\s+(\w+)/))) {
        currentStructure = {
          type: match[2] === 'interface' ? 'interface' : 'block',
          name: match[3],
          startLine: i,
          isExported: !!match[1],
        };
        braceCount = 0;
      }
    }
    
    // Count braces to track nesting
    if (currentStructure !== null) {
      let tempLine = line;
      let pos = 0;
      
      // More accurate brace counting with string and comment support
      while (pos < tempLine.length) {
        // Skip string literals
        if (tempLine[pos] === '"' || tempLine[pos] === "'" || tempLine[pos] === '`') {
          const quote = tempLine[pos];
          pos++;
          while (pos < tempLine.length && tempLine[pos] !== quote) {
            // Skip escaped quotes
            if (tempLine[pos] === '\\') pos++;
            pos++;
          }
          if (pos < tempLine.length) pos++;
          continue;
        }
        
        // Skip comments
        if (pos < tempLine.length - 1 && tempLine[pos] === '/' && tempLine[pos+1] === '/') {
          break; // Rest of line is comment
        }
        if (pos < tempLine.length - 1 && tempLine[pos] === '/' && tempLine[pos+1] === '*') {
          pos += 2;
          while (pos < tempLine.length - 1 && !(tempLine[pos] === '*' && tempLine[pos+1] === '/')) {
            pos++;
          }
          if (pos < tempLine.length - 1) pos += 2;
          continue;
        }
        
        // Count actual braces
        if (tempLine[pos] === '{') braceCount++;
        if (tempLine[pos] === '}') braceCount--;
        
        pos++;
      }
      
      // If braces are balanced, structure is complete
      if (braceCount === 0 && line.includes('}')) {
        currentStructure.endLine = i;
        currentStructure.code = lines.slice(currentStructure.startLine, i + 1).join('\n');
        structures.push(currentStructure as CodeStructure);
        currentStructure = null;
      }
    }
  }
  
  // Handle unclosed structures (though they should be closed)
  if (currentStructure !== null) {
    currentStructure.endLine = lines.length - 1;
    currentStructure.code = lines.slice(currentStructure.startLine).join('\n');
    structures.push(currentStructure as CodeStructure);
  }
  
  return structures;
}

/**
 * Identify Python-specific structures (functions, classes)
 */
function identifyPythonStructures(code: string): CodeStructure[] {
  const structures: CodeStructure[] = [];
  const lines = code.split('\n');
  
  let currentStructure: Partial<CodeStructure> | null = null;
  let baseIndent = -1;
  let currentIndent = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;
    
    // Calculate indentation
    const indent = line.search(/\S|$/);
    
    // Look for new function or class definitions
    if (currentStructure === null) {
      let match: RegExpMatchArray | null;
      
      // Function definition
      if ((match = trimmedLine.match(/^def\s+(\w+)\s*\(/))) {
        currentStructure = {
          type: 'function',
          name: match[1],
          startLine: i,
        };
        baseIndent = indent;
        currentIndent = indent;
      }
      // Class definition
      else if ((match = trimmedLine.match(/^class\s+(\w+)(?:\(.*\))?:/))) {
        currentStructure = {
          type: 'class',
          name: match[1],
          startLine: i,
        };
        baseIndent = indent;
        currentIndent = indent;
      }
    }
    // If we're inside a structure, check for end
    else if (currentStructure !== null) {
      // If indent level is less than or equal to base level, structure is complete
      if (trimmedLine !== '' && indent <= baseIndent) {
        currentStructure.endLine = i - 1;
        currentStructure.code = lines.slice(currentStructure.startLine, i).join('\n');
        structures.push(currentStructure as CodeStructure);
        currentStructure = null;
        
        // Check if the current line starts a new structure
        let match: RegExpMatchArray | null;
        if ((match = trimmedLine.match(/^def\s+(\w+)\s*\(/))) {
          currentStructure = {
            type: 'function',
            name: match[1],
            startLine: i,
          };
          baseIndent = indent;
          currentIndent = indent;
        }
        else if ((match = trimmedLine.match(/^class\s+(\w+)(?:\(.*\))?:/))) {
          currentStructure = {
            type: 'class',
            name: match[1],
            startLine: i,
          };
          baseIndent = indent;
          currentIndent = indent;
        }
      }
      else {
        // Update current indent level
        if (trimmedLine !== '') {
          currentIndent = indent;
        }
      }
    }
  }
  
  // Handle the last structure if there is one
  if (currentStructure !== null) {
    currentStructure.endLine = lines.length - 1;
    currentStructure.code = lines.slice(currentStructure.startLine).join('\n');
    structures.push(currentStructure as CodeStructure);
  }
  
  return structures;
}

/**
 * Identify C-style language structures (classes, functions, namespaces)
 */
function identifyCStyleStructures(code: string, language: string): CodeStructure[] {
  const structures: CodeStructure[] = [];
  const lines = code.split('\n');
  
  let currentStructure: Partial<CodeStructure> | null = null;
  let braceCount = 0;
  let inComment = false;
  let inString = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (trimmedLine === '') continue;
    
    // Handle comments
    if (trimmedLine.startsWith('//')) continue;
    if (!inComment && trimmedLine.includes('/*')) {
      inComment = true;
      if (trimmedLine.includes('*/') && 
          trimmedLine.lastIndexOf('*/') > trimmedLine.lastIndexOf('/*')) {
        inComment = false;
      }
      continue;
    }
    if (inComment) {
      if (trimmedLine.includes('*/')) {
        inComment = false;
      }
      continue;
    }
    
    // Look for structure starts if not in a structure
    if (currentStructure === null) {
      let match: RegExpMatchArray | null;
      
      // Class declaration
      if ((match = trimmedLine.match(/^(?:public|private|protected|internal|static)?\s*class\s+(\w+)/))) {
        currentStructure = {
          type: 'class',
          name: match[1],
          startLine: i,
        };
        braceCount = 0;
      }
      // Function/method declaration
      else if ((match = trimmedLine.match(/^(?:public|private|protected|internal|static|virtual|override)?\s*\w+\s+(\w+)\s*\(/))) {
        currentStructure = {
          type: 'function',
          name: match[1],
          startLine: i,
        };
        braceCount = 0;
      }
      // Namespace declaration
      else if ((match = trimmedLine.match(/^namespace\s+(\w+)/))) {
        currentStructure = {
          type: 'namespace',
          name: match[1],
          startLine: i,
        };
        braceCount = 0;
      }
      // Interface declaration
      else if ((match = trimmedLine.match(/^(?:public|private|protected|internal)?\s*interface\s+(\w+)/))) {
        currentStructure = {
          type: 'interface',
          name: match[1],
          startLine: i,
        };
        braceCount = 0;
      }
      // C++ template class or function
      else if (language === 'cpp' && (match = trimmedLine.match(/^template\s*<.*>\s*(class|struct|void|[\w:]+)\s+(\w+)/))) {
        currentStructure = {
          type: match[1] === 'class' || match[1] === 'struct' ? 'class' : 'function',
          name: match[2],
          startLine: i,
        };
        braceCount = 0;
      }
      // Go function
      else if (language === 'go' && (match = trimmedLine.match(/^func\s+(\w+)/))) {
        currentStructure = {
          type: 'function',
          name: match[1],
          startLine: i,
        };
        braceCount = 0;
      }
    }
    
    // Count braces to track nesting
    if (currentStructure !== null) {
      let tempLine = trimmedLine;
      let pos = 0;
      
      // More accurate brace counting with string and comment support
      while (pos < tempLine.length) {
        // Skip string literals
        if (tempLine[pos] === '"' || tempLine[pos] === "'") {
          const quote = tempLine[pos];
          pos++;
          while (pos < tempLine.length && tempLine[pos] !== quote) {
            // Skip escaped quotes
            if (tempLine[pos] === '\\') pos++;
            pos++;
          }
          if (pos < tempLine.length) pos++;
          continue;
        }
        
        // Skip comments
        if (pos < tempLine.length - 1 && tempLine[pos] === '/' && tempLine[pos+1] === '/') {
          break; // Rest of line is comment
        }
        if (pos < tempLine.length - 1 && tempLine[pos] === '/' && tempLine[pos+1] === '*') {
          pos += 2;
          while (pos < tempLine.length - 1 && !(tempLine[pos] === '*' && tempLine[pos+1] === '/')) {
            pos++;
          }
          if (pos < tempLine.length - 1) pos += 2;
          continue;
        }
        
        // Count actual braces
        if (tempLine[pos] === '{') braceCount++;
        if (tempLine[pos] === '}') braceCount--;
        
        pos++;
      }
      
      // If braces are balanced, structure is complete
      if (braceCount === 0 && trimmedLine.includes('}')) {
        currentStructure.endLine = i;
        currentStructure.code = lines.slice(currentStructure.startLine, i + 1).join('\n');
        structures.push(currentStructure as CodeStructure);
        currentStructure = null;
      }
    }
  }
  
  // Handle unclosed structures (though they should be closed)
  if (currentStructure !== null) {
    currentStructure.endLine = lines.length - 1;
    currentStructure.code = lines.slice(currentStructure.startLine).join('\n');
    structures.push(currentStructure as CodeStructure);
  }
  
  return structures;
}

/**
 * Group structures into chunks based on size constraints
 */
function createChunksFromStructures(
  code: string,
  language: string,
  structures: CodeStructure[],
  imports: string[],
  declarations: string[],
  options: Required<ChunkerOptions>
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = code.split('\n');
  
  // Group structures into chunks based on size
  let currentChunk: CodeStructure[] = [];
  let currentSize = 0;
  
  for (const structure of structures) {
    const structureSize = structure.endLine - structure.startLine + 1;
    
    // If structure is too large on its own, it needs to be broken down
    if (structureSize > options.maxChunkSize) {
      // Add any current chunk before handling this large structure
      if (currentChunk.length > 0) {
        chunks.push(createChunkFromStructures(currentChunk, lines, language, imports, declarations));
        currentChunk = [];
        currentSize = 0;
      }
      
      // Break down the large structure using generic chunking
      const largeStructureCode = structure.code;
      const subChunks = enhancedChunkGeneric(largeStructureCode, language, options);
      
      // Add metadata about the parent structure
      for (const subChunk of subChunks) {
        subChunk.metadata = {
          ...subChunk.metadata,
          parentStructure: {
            type: structure.type,
            name: structure.name,
            isExported: structure.isExported,
          },
          isPartial: true,
          partIndex: subChunks.indexOf(subChunk),
          totalParts: subChunks.length,
        };
        
        // Adjust start line to be relative to the full code
        subChunk.startLine += structure.startLine;
        subChunk.endLine += structure.startLine;
        
        chunks.push(subChunk);
      }
    }
    // If adding this structure would exceed max size, create a new chunk
    else if (currentSize + structureSize > options.maxChunkSize && currentChunk.length > 0) {
      chunks.push(createChunkFromStructures(currentChunk, lines, language, imports, declarations));
      currentChunk = [structure];
      currentSize = structureSize;
    }
    // Otherwise, add to current chunk
    else {
      currentChunk.push(structure);
      currentSize += structureSize;
    }
  }
  
  // Add any remaining structures as the final chunk
  if (currentChunk.length > 0) {
    chunks.push(createChunkFromStructures(currentChunk, lines, language, imports, declarations));
  }
  
  // Handle any code outside of identified structures
  const coveredLines = new Set<number>();
  for (const structure of structures) {
    for (let i = structure.startLine; i <= structure.endLine; i++) {
      coveredLines.add(i);
    }
  }
  
  // Find uncovered code segments
  const uncoveredSegments: {start: number, end: number}[] = [];
  let currentStart: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    if (!coveredLines.has(i)) {
      if (currentStart === null) {
        currentStart = i;
      }
    } else if (currentStart !== null) {
      uncoveredSegments.push({start: currentStart, end: i - 1});
      currentStart = null;
    }
  }
  
  // Handle final segment if there is one
  if (currentStart !== null) {
    uncoveredSegments.push({start: currentStart, end: lines.length - 1});
  }
  
  // Create chunks for uncovered segments or merge with adjacent chunks
  for (const segment of uncoveredSegments) {
    const segmentSize = segment.end - segment.start + 1;
    
    // Skip tiny segments (likely whitespace)
    if (segmentSize < 3) continue;
    
    // Analyze the segment to see if it's just comments
    const segmentCode = lines.slice(segment.start, segment.end + 1).join('\n');
    const commentRatio = calculateCommentRatio(segmentCode, language);
    
    // If it's mostly comments and we have adjacent chunks, try to merge
    if (commentRatio > 0.7 && chunks.length > 0) {
      // Find closest chunk
      let closestChunk = chunks[0];
      let minDistance = Math.abs(closestChunk.startLine - segment.end);
      
      for (const chunk of chunks) {
        const distanceBefore = Math.abs(chunk.startLine - segment.end);
        const distanceAfter = Math.abs(segment.start - chunk.endLine);
        const distance = Math.min(distanceBefore, distanceAfter);
        
        if (distance < minDistance) {
          closestChunk = chunk;
          minDistance = distance;
        }
      }
      
      // Merge with closest chunk if it's really close
      if (minDistance <= 5) {
        // Determine if segment is before or after chunk
        if (segment.end < closestChunk.startLine) {
          closestChunk.code = segmentCode + '\n' + closestChunk.code;
          closestChunk.startLine = segment.start;
        } else {
          closestChunk.code = closestChunk.code + '\n' + segmentCode;
          closestChunk.endLine = segment.end;
        }
        continue;
      }
    }
    
    // Create a chunk for significant uncovered code
    chunks.push({
      id: generateChunkId(),
      code: segmentCode,
      language,
      startLine: segment.start,
      endLine: segment.end,
      context: {
        imports: imports.length > 0 ? imports : undefined,
        declarations: getRelevantDeclarations(segmentCode, language, declarations),
      },
      metadata: {
        isUncategorized: true,
        commentRatio
      }
    });
  }
  
  // Sort chunks by start line for consistency
  return chunks.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Create a chunk from a group of structures
 */
function createChunkFromStructures(
  structures: CodeStructure[],
  allLines: string[],
  language: string,
  imports: string[],
  declarations: string[]
): CodeChunk {
  // Find the min and max lines
  const startLine = Math.min(...structures.map(s => s.startLine));
  const endLine = Math.max(...structures.map(s => s.endLine));
  
  // Extract the code
  let code = allLines.slice(startLine, endLine + 1).join('\n');
  
  // Add imports if they aren't already in the code
  const codeImports = extractImports(code, language);
  const missingImports = imports.filter(imp => !codeImports.includes(imp));
  
  if (missingImports.length > 0) {
    code = missingImports.join('\n') + '\n\n' + code;
  }
  
  // Get relevant declarations for this code
  const relevantDeclarations = getRelevantDeclarations(code, language, declarations);
  
  return {
    id: generateChunkId(),
    code,
    language,
    startLine,
    endLine,
    context: {
      imports: imports.length > 0 ? imports : undefined,
      declarations: relevantDeclarations.length > 0 ? relevantDeclarations : undefined,
      dependencies: structures.map(s => s.name).filter(Boolean) as string[],
    },
    metadata: {
      structures: structures.map(s => ({
        type: s.type,
        name: s.name,
        isExported: s.isExported,
      })),
      commentRatio: calculateCommentRatio(code, language)
    }
  };
}

/**
 * Get declarations that are relevant to the given code chunk
 */
function getRelevantDeclarations(
  code: string,
  language: string,
  allDeclarations: string[]
): string[] {
  // Simple implementation: include declarations that might be referenced in the code
  const relevantDeclarations: string[] = [];
  
  for (const declaration of allDeclarations) {
    // Extract the name of the declared entity
    let match: RegExpMatchArray | null = null;
    
    switch (language) {
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        match = declaration.match(/(?:function|class|const|let|var)\s+(\w+)/);
        break;
      case 'python':
        match = declaration.match(/(?:def|class)\s+(\w+)/);
        break;
      case 'java':
      case 'kotlin':
      case 'csharp':
        match = declaration.match(/(?:class|interface|enum)\s+(\w+)/);
        break;
      case 'cpp':
      case 'c':
        match = declaration.match(/(?:class|struct|enum|typedef|namespace)\s+(\w+)/);
        break;
      case 'go':
        match = declaration.match(/(?:func|type|var|const)\s+(\w+)/);
        break;
    }
    
    if (match && match[1]) {
      const name = match[1];
      // Check if name is used in the code
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      if (regex.test(code)) {
        relevantDeclarations.push(declaration);
      }
    }
  }
  
  return relevantDeclarations;
}

/**
 * Generate a unique ID for a chunk
 */
function generateChunkId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}