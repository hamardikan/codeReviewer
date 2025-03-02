'use client';

import React, { useState, useEffect } from 'react';
import { Clipboard, Check, Code, RefreshCw } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { CodeSuggestion } from '@/lib/prompts';

interface CleanCodeViewProps {
  cleanCode: string;
  originalCode?: string;
  suggestions: CodeSuggestion[];
  languageId?: string;
  isLoading?: boolean;
}

export default function CleanCodeView({ 
  cleanCode, 
  originalCode,
  suggestions,
  languageId = 'javascript',
  isLoading = false 
}: CleanCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [showMode, setShowMode] = useState<'ai' | 'custom'>('ai');
  const [customCode, setCustomCode] = useState('');
  
  // Generate custom code based on accepted suggestions
  useEffect(() => {
    if (!originalCode) return;
    
    // Start with the original code
    let result = originalCode;
    
    // Sort suggestions by line number in descending order to avoid offset issues
    // when making replacements from bottom to top
    const sortedSuggestions = [...suggestions]
      .filter(s => s.accepted === true)
      .sort((a, b) => b.lineNumber - a.lineNumber);
    
    // Apply each accepted suggestion
    for (const suggestion of sortedSuggestions) {
      const lines = result.split('\n');
      
      // Make sure line number is valid
      if (suggestion.lineNumber > 0 && suggestion.lineNumber <= lines.length) {
        // Find and replace the original code with the suggested one
        // We'll look for exact matches of the original code
        const lineIndex = suggestion.lineNumber - 1;
        const originalLine = lines[lineIndex];
        
        if (originalLine.includes(suggestion.originalCode.trim())) {
          lines[lineIndex] = originalLine.replace(
            suggestion.originalCode.trim(), 
            suggestion.suggestedCode.trim()
          );
        } else {
          // Fallback: just replace the entire line
          lines[lineIndex] = suggestion.suggestedCode;
        }
        
        result = lines.join('\n');
      }
    }
    
    setCustomCode(result);
  }, [originalCode, suggestions]);
  
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
  
  if (!cleanCode && !customCode) {
    return (
      <div className="text-center py-10 border border-gray-200 rounded-lg">
        <Code className="h-8 w-8 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No clean code available yet.</p>
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
          onClick={() => copyToClipboard(showMode === 'ai' ? cleanCode : customCode)}
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
      
      <div className="relative">
        <SyntaxHighlighter
          language={languageId}
          style={vs2015}
          customStyle={{ margin: 0, maxHeight: '70vh' }}
          showLineNumbers={true}
        >
          {showMode === 'ai' ? cleanCode : customCode}
        </SyntaxHighlighter>
      </div>
      
      {showMode === 'custom' && (
        <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-sm text-gray-600">
          <div className="flex items-center">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            <span>Code updated with {acceptedCount} accepted suggestion{acceptedCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}