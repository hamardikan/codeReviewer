'use client';

import React, { useState } from 'react';
import { Clipboard, Check, Code } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface CleanCodeViewProps {
  cleanCode: string;
  isLoading?: boolean;
}

export default function CleanCodeView({ cleanCode, isLoading = false }: CleanCodeViewProps) {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(cleanCode);
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
  
  if (!cleanCode) {
    return (
      <div className="text-center py-10 border border-gray-200 rounded-lg">
        <Code className="h-8 w-8 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No clean code available yet.</p>
      </div>
    );
  }
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-medium text-gray-700">Improved Code</h3>
        <button
          onClick={copyToClipboard}
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
          language="javascript"
          style={vs2015}
          customStyle={{ margin: 0, maxHeight: '70vh' }}
          showLineNumbers={true}
        >
          {cleanCode}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}