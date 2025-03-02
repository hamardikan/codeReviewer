import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { rust } from '@codemirror/lang-rust';
import { Extension } from '@codemirror/state';

/**
 * Supported programming language configuration
 */
export interface Language {
  id: string;
  name: string;
  extensions: string[];
  setup: () => Extension;
  filePatterns?: RegExp[];
  codePatterns?: RegExp[];
}

/**
 * List of supported programming languages
 */
export const LANGUAGES: Language[] = [
  { 
    id: 'javascript', 
    name: 'JavaScript', 
    extensions: ['js', 'jsx', 'mjs'], 
    setup: javascript,
    filePatterns: [/\.jsx?$/i],
    codePatterns: [/function\s+\w+\s*\(/, /const\s+\w+\s*=/, /var\s+\w+\s*=/, /let\s+\w+\s*=/, /export\s+default/, /import\s+.*\s+from/]
  },
  { 
    id: 'typescript', 
    name: 'TypeScript', 
    extensions: ['ts', 'tsx'], 
    setup: javascript,
    filePatterns: [/\.tsx?$/i],
    codePatterns: [/interface\s+\w+/, /type\s+\w+\s*=/, /class\s+\w+\s*implements/, /export\s+interface/]
  },
  { 
    id: 'python', 
    name: 'Python', 
    extensions: ['py', 'pyw', 'ipynb'], 
    setup: python,
    filePatterns: [/\.pyw?$/i],
    codePatterns: [/def\s+\w+\s*\(.*\):/, /import\s+\w+/, /from\s+\w+\s+import/, /class\s+\w+\s*\(.*\):/]
  },
  { 
    id: 'java', 
    name: 'Java', 
    extensions: ['java'], 
    setup: java,
    filePatterns: [/\.java$/i],
    codePatterns: [/public\s+class\s+\w+/, /private\s+\w+\s+\w+;/, /package\s+[\w.]+;/]
  },
  { 
    id: 'cpp', 
    name: 'C++', 
    extensions: ['cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx'], 
    setup: cpp,
    filePatterns: [/\.cpp$/i, /\.cc$/i, /\.cxx$/i, /\.hpp$/i],
    codePatterns: [/#include\s+<\w+>/, /namespace\s+\w+/, /std::\w+/]
  },
  { 
    id: 'c', 
    name: 'C', 
    extensions: ['c', 'h'], 
    setup: cpp,
    filePatterns: [/\.c$/i],
    codePatterns: [/#include\s+<\w+\.h>/, /void\s+\w+\s*\(/, /struct\s+\w+\s*{/]
  },
  { 
    id: 'csharp', 
    name: 'C#', 
    extensions: ['cs'], 
    setup: cpp,
    filePatterns: [/\.cs$/i],
    codePatterns: [/namespace\s+\w+/, /using\s+[\w.]+;/, /public\s+class\s+\w+/]
  },
  { 
    id: 'html', 
    name: 'HTML', 
    extensions: ['html', 'htm'], 
    setup: html,
    filePatterns: [/\.html?$/i],
    codePatterns: [/<(!DOCTYPE|html|head|body)\b/, /<div\b/, /<script\b/]
  },
  { 
    id: 'css', 
    name: 'CSS', 
    extensions: ['css'], 
    setup: css,
    filePatterns: [/\.css$/i],
    codePatterns: [/\w+\s*{[\s\w-:;]+}/, /\@media\s+/, /\.\w+\s*{/]
  },
  { 
    id: 'php', 
    name: 'PHP', 
    extensions: ['php'], 
    setup: php,
    filePatterns: [/\.php$/i],
    codePatterns: [/<\?php/, /function\s+\w+\s*\(/, /\$\w+\s*=/]
  },
  { 
    id: 'sql', 
    name: 'SQL', 
    extensions: ['sql'], 
    setup: sql,
    filePatterns: [/\.sql$/i],
    codePatterns: [/SELECT\s+.*\s+FROM/, /CREATE\s+TABLE/, /INSERT\s+INTO/i]
  },
  { 
    id: 'markdown', 
    name: 'Markdown', 
    extensions: ['md', 'markdown'], 
    setup: markdown,
    filePatterns: [/\.md$/i],
    codePatterns: [/^#\s+/, /^##\s+/, /^\*\s+/, /^-\s+/]
  },
  { 
    id: 'json', 
    name: 'JSON', 
    extensions: ['json'], 
    setup: json,
    filePatterns: [/\.json$/i],
    codePatterns: [/^{[\s\n]*"/, /^[\s\n]*{[\s\n]*"[\w-]+":/]
  },
  { 
    id: 'xml', 
    name: 'XML', 
    extensions: ['xml'], 
    setup: xml,
    filePatterns: [/\.xml$/i],
    codePatterns: [/<\?xml/, /<[a-zA-Z0-9]+>[^<]*<\/[a-zA-Z0-9]+>/]
  },
  { 
    id: 'rust', 
    name: 'Rust', 
    extensions: ['rs'], 
    setup: rust,
    filePatterns: [/\.rs$/i],
    codePatterns: [/fn\s+\w+\s*\(/, /use\s+\w+::/, /struct\s+\w+/]
  }
];

/**
 * Detect language from file extension
 * @param filename - Name of the file
 * @returns Detected language or undefined
 */
export function detectLanguageFromFilename(filename: string): Language | undefined {
  if (!filename) return undefined;
  
  const lowerFilename = filename.toLowerCase();
  
  // First try exact extension matching
  const extension = lowerFilename.split('.').pop();
  if (extension) {
    const langByExt = LANGUAGES.find(lang => 
      lang.extensions.includes(extension)
    );
    if (langByExt) return langByExt;
  }
  
  // Then try regex pattern matching
  return LANGUAGES.find(lang => 
    lang.filePatterns?.some(pattern => pattern.test(lowerFilename))
  );
}

/**
 * Detect language from code content
 * @param code - The code content to analyze
 * @returns Detected language or undefined
 */
export function detectLanguageFromContent(code: string): Language | undefined {
  if (!code.trim()) return undefined;
  
  // Create a score for each language based on pattern matches
  const scores = LANGUAGES.map(lang => {
    if (!lang.codePatterns) return { lang, score: 0 };
    
    const score = lang.codePatterns.reduce((total, pattern) => {
      return total + (pattern.test(code) ? 1 : 0);
    }, 0);
    
    return { lang, score };
  });
  
  // Sort by score and return the highest
  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].lang : undefined;
}

/**
 * Get the best guess for the code language
 * @param code - Code content
 * @param filename - Optional filename
 * @returns The detected language or JavaScript as default
 */
export function detectLanguage(code: string, filename?: string): Language {
  // First check filename if available
  if (filename) {
    const langByFilename = detectLanguageFromFilename(filename);
    if (langByFilename) return langByFilename;
  }
  
  // Then try content-based detection
  const langByContent = detectLanguageFromContent(code);
  if (langByContent) return langByContent;
  
  // Default to JavaScript if no match found
  return LANGUAGES.find(lang => lang.id === 'javascript')!;
}

/**
 * Get language by ID
 * @param id - Language ID
 * @returns Language object or JavaScript as fallback
 */
export function getLanguageById(id: string): Language {
  return LANGUAGES.find(lang => lang.id === id) || 
         LANGUAGES.find(lang => lang.id === 'javascript')!;
}