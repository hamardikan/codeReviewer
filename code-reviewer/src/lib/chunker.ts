/**
 * Code chunking module for distributed code review.
 * Provides functionality to divide code into logical chunks while maintaining context.
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
  }
  
  // Default options
  const DEFAULT_OPTIONS: ChunkerOptions = {
    maxChunkSize: 1000, // Max lines per chunk
    minChunkSize: 50,   // Min lines per chunk
    overlapPercentage: 10, // Overlap between chunks
    preserveImports: true, // Include import statements in each chunk
    smartChunking: true,   // Use language-specific chunking
  };
  
  /**
   * Main chunking function that divides code into logical chunks
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
      maxChunkSize: options.maxChunkSize ?? DEFAULT_OPTIONS.maxChunkSize!,
      minChunkSize: options.minChunkSize ?? DEFAULT_OPTIONS.minChunkSize!,
      overlapPercentage: options.overlapPercentage ?? DEFAULT_OPTIONS.overlapPercentage!,
      preserveImports: options.preserveImports ?? DEFAULT_OPTIONS.preserveImports!,
      smartChunking: options.smartChunking ?? DEFAULT_OPTIONS.smartChunking!
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
    if (finalOptions.smartChunking) {
      switch (language) {
        case 'javascript':
        case 'typescript':
        case 'jsx':
        case 'tsx':
          return chunkJavaScriptLike(code, language, finalOptions);
        case 'python':
          return chunkPython(code, language, finalOptions);
        case 'java':
        case 'kotlin':
        case 'csharp':
        case 'cpp':
          return chunkCStyleLanguage(code, language, finalOptions);
        default:
          // Fall back to simple chunking for unsupported languages
          return chunkGeneric(code, language, finalOptions);
      }
    } else {
      // Use generic chunking if smart chunking is disabled
      return chunkGeneric(code, language, finalOptions);
    }
  }
  
  /**
   * Generic chunking strategy that divides code into roughly equal chunks
   * with optional overlap
   */
  function chunkGeneric(
    code: string,
    language: string,
    options: Required<ChunkerOptions>
  ): CodeChunk[] {
    const lines = code.split('\n');
    const chunks: CodeChunk[] = [];
    
    // Determine imports if preserving them
    let imports: string[] = [];
    if (options.preserveImports) {
      imports = extractImports(code, language);
    }
    
    // Calculate chunk size based on maxChunkSize
    const effectiveChunkSize = Math.min(options.maxChunkSize, Math.max(options.minChunkSize, 
      Math.ceil(lines.length / Math.ceil(lines.length / options.maxChunkSize))));
    
    // Calculate overlap
    const overlap = Math.floor(effectiveChunkSize * (options.overlapPercentage / 100));
    
    // Create chunks with overlap
    let startLine = 0;
    while (startLine < lines.length) {
      let endLine = Math.min(startLine + effectiveChunkSize - 1, lines.length - 1);
      
      // Adjust endLine to avoid breaking in the middle of a statement if possible
      if (endLine < lines.length - 1) {
        const safeBreakAdjustment = findSafeBreakPoint(lines, endLine);
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
      
      chunks.push({
        id: generateChunkId(),
        code: chunkCode,
        language,
        startLine,
        endLine,
        context: {
          imports: imports.length > 0 ? imports : undefined,
        },
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
      return chunkGeneric(code, language, options);
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
   * Python specific chunking strategy
   */
  function chunkPython(
    code: string,
    language: string,
    options: Required<ChunkerOptions>
  ): CodeChunk[] {
    // Similar approach as JS but with Python syntax
    // This is a simplified implementation
    return chunkGeneric(code, language, options);
  }
  
  /**
   * C-style language (Java, C#, C++, etc.) chunking strategy
   */
  function chunkCStyleLanguage(
    code: string,
    language: string,
    options: Required<ChunkerOptions>
  ): CodeChunk[] {
    // Similar approach as JS but with C-style syntax
    // This is a simplified implementation
    return chunkGeneric(code, language, options);
  }
  
  // Helper function to find a safe point to break a chunk
  function findSafeBreakPoint(lines: string[], currentLine: number): number {
    // Look ahead a few lines to find a safe break point (empty line or end of block)
    const MAX_LOOKAHEAD = 10;
    
    for (let i = 0; i < MAX_LOOKAHEAD && currentLine + i < lines.length; i++) {
      const line = lines[currentLine + i].trim();
      
      // Empty line is a safe breaking point
      if (line === '') {
        return i;
      }
      
      // End of a block is a good break point
      if (line === '}' || line === '};') {
        return i;
      }
      
      // End of a statement might be ok
      if (line.endsWith(';') || line.endsWith('}')) {
        return i;
      }
    }
    
    // If no good break point found, suggest no adjustment
    return 0;
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
        importPattern = /^import\s+[\w.]+;/;
        break;
      default:
        importPattern = /^import\s+/;
    }
    
    // Find all import lines
    for (const line of lines) {
      if (importPattern.test(line.trim())) {
        imports.push(line);
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
      case 'csharp':
        declarationPattern = /^(public|private|protected|internal|class|interface|enum)\s+/;
        break;
      default:
        declarationPattern = /^(function|class)\s+\w+/;
    }
    
    // Find declaration lines
    for (const line of lines) {
      if (declarationPattern.test(line.trim())) {
        declarations.push(line);
      }
    }
    
    return declarations;
  }
  
  /**
   * Identify logical structures in JavaScript/TypeScript code
   */
  interface CodeStructure {
    type: 'function' | 'class' | 'component' | 'block' | 'unknown';
    name?: string;
    startLine: number;
    endLine: number;
    code: string;
    isExported?: boolean;
  }
  
  function identifyJSStructures(code: string): CodeStructure[] {
    const structures: CodeStructure[] = [];
    const lines = code.split('\n');
    
    // Very simplified parser - a real implementation would use an AST parser
    let currentStructure: Partial<CodeStructure> | null = null;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for structure starts if not in a structure
      if (currentStructure === null) {
        let match: RegExpMatchArray | null;
        
        // Function declaration
        if ((match = line.match(/^(export\s+)?(function\s+(\w+)|\w+\s*=\s*function\s*\()/))) {
          currentStructure = {
            type: 'function',
            name: match[3] || 'anonymous',
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
      }
      
      // Count braces to track nesting
      if (currentStructure !== null) {
        // Count opening braces
        const openingBraces = (line.match(/{/g) || []).length;
        braceCount += openingBraces;
        
        // Count closing braces
        const closingBraces = (line.match(/}/g) || []).length;
        braceCount -= closingBraces;
        
        // If braces are balanced, structure is complete
        if (braceCount === 0 && line.includes('}')) {
          currentStructure.endLine = i;
          currentStructure.code = lines.slice(currentStructure.startLine, i + 1).join('\n');
          structures.push(currentStructure as CodeStructure);
          currentStructure = null;
        }
      }
    }
    
    return structures;
  }
  
  /**
   * Create chunks from identified code structures
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
        const subChunks = chunkGeneric(largeStructureCode, language, options);
        
        // Add metadata about the parent structure
        for (const subChunk of subChunks) {
          subChunk.metadata = {
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
      
      // Create a chunk for significant uncovered code
      const segmentCode = lines.slice(segment.start, segment.end + 1).join('\n');
      chunks.push({
        id: generateChunkId(),
        code: segmentCode,
        language,
        startLine: segment.start,
        endLine: segment.end,
        context: {
          imports: imports.length > 0 ? imports : undefined,
          declarations: declarations.length > 0 ? declarations : undefined,
        },
        metadata: {
          isUncategorized: true,
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
    
    return {
      id: generateChunkId(),
      code,
      language,
      startLine,
      endLine,
      context: {
        imports: imports.length > 0 ? imports : undefined,
        declarations: declarations.length > 0 ? declarations : undefined,
        dependencies: structures.map(s => s.name).filter(Boolean) as string[],
      },
      metadata: {
        structures: structures.map(s => ({
          type: s.type,
          name: s.name,
          isExported: s.isExported,
        })),
      }
    };
  }
  
  /**
   * Generate a unique ID for a chunk
   */
  function generateChunkId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }