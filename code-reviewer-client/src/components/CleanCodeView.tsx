'use client';

import React, { useState, useEffect } from 'react';
import { Clipboard, Check, Code, RefreshCw, AlertTriangle } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { CodeSuggestion } from '@/lib/prompts';

interface CleanCodeViewProps {
  cleanCode: string;
  originalCode?: string;
  suggestions: CodeSuggestion[];
  languageId?: string;
  isLoading?: boolean;
  onRequestRepair?: () => void;
}

export default function CleanCodeView({ 
  cleanCode, 
  originalCode,
  suggestions,
  languageId = 'javascript',
  isLoading = false,
  onRequestRepair
}: CleanCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [showMode, setShowMode] = useState<'ai' | 'custom'>('ai');
  const [customCode, setCustomCode] = useState('');
  const [codeIsSuspicious, setCodeIsSuspicious] = useState(false);
  
  // Check if the clean code appears incomplete or suspiciously short
  useEffect(() => {
    if (cleanCode) {
      const isSuspicious = 
        // Suspiciously short compared to original code
        (originalCode && cleanCode.length < originalCode.length * 0.7) ||
        // Contains truncation markers
        cleanCode.includes('...') ||
        // Sudden end without proper closure
        (cleanCode.match(/{/g)?.length || 0) > (cleanCode.match(/}/g)?.length || 0) ||
        // Suspiciously short in absolute terms
        (originalCode && originalCode.length > 500 && cleanCode.length < 300);
        
      setCodeIsSuspicious(Boolean(isSuspicious));
    } else {
      setCodeIsSuspicious(false);
    }
  }, [cleanCode, originalCode]);
  
  // Generate custom code based on accepted suggestions
  useEffect(() => {
    // If clean code is empty, reset custom code and return
    if (!cleanCode.trim()) {
      setCustomCode('');
      return;
    }
    
    // If no original code is provided, use clean code as fallback
    if (!originalCode) {
      setCustomCode(cleanCode);
      return;
    }
    
    // Check if we have any accepted suggestions
    const acceptedSuggestions = suggestions.filter(s => s.accepted === true);
    
    if (acceptedSuggestions.length === 0) {
      // If no accepted suggestions, use the original code
      setCustomCode(originalCode);
      return;
    }
    
    // Start with the original code
    let result = originalCode;
    
    // Track applied changes to avoid conflicts
    const modifiedLines = new Set<number>();
    
    // Sort suggestions by line number in descending order to avoid offset issues
    // when making replacements from bottom to top
    const sortedSuggestions = [...acceptedSuggestions]
      .sort((a, b) => b.lineNumber - a.lineNumber);
    
    // Apply each accepted suggestion
    for (const suggestion of sortedSuggestions) {
      // Skip if we've already modified this line
      if (modifiedLines.has(suggestion.lineNumber)) continue;
      
      const lines = result.split('\n');
      
      // Skip if line number is invalid
      if (suggestion.lineNumber <= 0 || suggestion.lineNumber > lines.length) continue;
      
      // Get line index (0-based)
      const lineIndex = suggestion.lineNumber - 1;
      const originalLine = lines[lineIndex];
      
      // Try to locate the exact code within the line
      if (originalLine.includes(suggestion.originalCode.trim())) {
        lines[lineIndex] = originalLine.replace(
          suggestion.originalCode.trim(), 
          suggestion.suggestedCode.trim()
        );
        modifiedLines.add(suggestion.lineNumber);
      } else {
        // If exact match fails, try a more flexible approach
        // This handles cases where whitespace or indentation differs
        const trimmedOriginal = suggestion.originalCode.trim();
        const trimmedLine = originalLine.trim();
        
        if (trimmedLine === trimmedOriginal || trimmedLine.includes(trimmedOriginal)) {
          // Preserve indentation
          const indentation = originalLine.match(/^\s*/)?.[0] || '';
          lines[lineIndex] = indentation + suggestion.suggestedCode.trim();
          modifiedLines.add(suggestion.lineNumber);
        } else {
          // Last resort: replace the whole line
          lines[lineIndex] = suggestion.suggestedCode.trim();
          modifiedLines.add(suggestion.lineNumber);
        }
      }
      
      result = lines.join('\n');
    }
    
    setCustomCode(result);
  }, [originalCode, suggestions, cleanCode]);
  
  const copyToClipboard = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };
  
  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden animate-pulse">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-1/4"></div>
          <div className="h-5 bg-gray-200 rounded w-10"></div>
        </div>
        <div className="p-4">
          <div className="h-40 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }
  
  const codeToDisplay = showMode === 'ai' ? cleanCode : customCode;
  
  if (!codeToDisplay) {
    return (
      <div className="text-center py-10 border border-gray-200 rounded-lg">
        <Code className="h-8 w-8 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No code available yet.</p>
      </div>
    );
  }
  
  // Count the number of accepted suggestions
  const acceptedCount = suggestions.filter(s => s.accepted === true).length;
  const totalSuggestions = suggestions.length;
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center">
          <h3 className="font-medium text-gray-700">Improved Code</h3>
          {totalSuggestions > 0 && (
            <div className="ml-4 flex items-center space-x-2">
              <button
                onClick={() => setShowMode('ai')}
                className={`px-2 py-1 text-sm rounded ${
                  showMode === 'ai' 
                    ? 'bg-green-100 text-green-800 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                AI Suggested
              </button>
              <button
                onClick={() => setShowMode('custom')}
                className={`px-2 py-1 text-sm rounded ${
                  showMode === 'custom' 
                    ? 'bg-green-100 text-green-800 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Custom ({acceptedCount}/{totalSuggestions})
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => copyToClipboard(codeToDisplay)}
          className="p-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center text-sm"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-green-600">Copied!</span>
            </>
          ) : (
            <>
              <Clipboard className="h-4 w-4 text-gray-600 mr-1" />
              <span className="text-gray-600">Copy</span>
            </>
          )}
        </button>
      </div>
      
      {/* Warning for suspicious code */}
      {codeIsSuspicious && showMode === 'ai' && (
        <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-200 flex items-center">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
          <span className="text-sm text-yellow-700">
            This code may be incomplete. 
            {onRequestRepair && (
              <button 
                onClick={onRequestRepair}
                className="ml-2 px-2 py-0.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-sm"
              >
                Attempt repair
              </button>
            )}
          </span>
        </div>
      )}
      
      <div className="relative">
        <SyntaxHighlighter
          language={languageId}
          style={vs2015}
          customStyle={{ margin: 0, maxHeight: '70vh' }}
          showLineNumbers={true}
        >
          {codeToDisplay}
        </SyntaxHighlighter>
      </div>
      
      {showMode === 'custom' && (
        <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-sm text-gray-600">
          <div className="flex items-center">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            <span>
              {acceptedCount > 0 
                ? `Code updated with ${acceptedCount} accepted suggestion${acceptedCount !== 1 ? 's' : ''}`
                : 'No suggestions have been accepted yet'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}