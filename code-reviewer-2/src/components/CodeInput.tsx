'use client';

import { useState } from 'react';
import { Upload, Clipboard, ChevronRight } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

/**
 * List of supported programming languages
 */
const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', extension: 'js', setup: javascript },
  { id: 'python', name: 'Python', extension: 'py', setup: python },
  { id: 'java', name: 'Java', extension: 'java', setup: java },
  { id: 'cpp', name: 'C++', extension: 'cpp', setup: cpp },
];

interface CodeInputProps {
  onSubmit: (code: string) => void;
  isSubmitting: boolean;
}

export default function CodeInput({ onSubmit, isSubmitting }: CodeInputProps) {
  const [code, setCode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code);
    }
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Auto-detect language based on file extension
    const extension = file.name.split('.').pop() || '';
    const language = LANGUAGES.find(lang => lang.extension === extension) || selectedLanguage;
    setSelectedLanguage(language);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCode(content);
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-green-600">Submit Code for Review</h2>
        <div className="flex items-center space-x-2">
          <label htmlFor="language-select" className="text-sm text-gray-600">
            Language:
          </label>
          <select
            id="language-select"
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={selectedLanguage.id}
            onChange={(e) => {
              const languageId = e.target.value;
              const language = LANGUAGES.find(lang => lang.id === languageId) || LANGUAGES[0];
              setSelectedLanguage(language);
            }}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-green-600">Upload your code file</h3>
        <p className="mt-2 text-sm text-gray-600">Drag and drop your file here or click to browse</p>
        <input
          type="file"
          id="file-upload"
          className="hidden"
          onChange={handleFileUpload}
          accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rb,.php,.html,.css"
        />
        <label
          htmlFor="file-upload"
          className="mt-4 inline-block px-4 py-2 bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 cursor-pointer"
        >
          Browse files
        </label>
      </div>
      
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center mb-4">
          <Clipboard className="h-4 w-4 text-gray-600 mr-2" />
          <p className="text-sm text-gray-700">Or paste your code directly</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="border border-gray-300 rounded-md shadow-sm">
            <CodeMirror
              value={code}
              height="400px"
              theme={vscodeDark}
              extensions={[selectedLanguage.setup()]}
              onChange={(value) => setCode(value)}
              placeholder="// Paste or type your code here"
            />
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="flex items-center px-6 py-2 bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>Submit for Review</span>
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}