'use client';

import { useState, useRef } from 'react';
import { Upload, Clipboard, ChevronRight } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { LANGUAGES, detectLanguage } from '@/lib/language-utils';

interface CodeInputProps {
  onSubmit: (code: string, language: string, filename?: string) => void;
  isSubmitting: boolean;
}

export default function CodeInput({ onSubmit, isSubmitting }: CodeInputProps) {
  const [code, setCode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code, selectedLanguage.id, filename);
    }
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFilename(file.name);
    
    // Detect language based on file
    const detectedLang = detectLanguage('', file.name);
    setSelectedLanguage(detectedLang);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCode(content);
      
      // Double-check language based on content too
      const contentLang = detectLanguage(content, file.name);
      setSelectedLanguage(contentLang);
    };
    reader.readAsText(file);
  };
  
  const handleCodeChange = (value: string) => {
    setCode(value);
    
    // If no language selected already by file extension, try to detect from content
    if (!filename && value.length > 50) {
      const detectedLang = detectLanguage(value);
      if (detectedLang.id !== selectedLanguage.id) {
        setSelectedLanguage(detectedLang);
      }
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-green-600">Submit Code for Review</h2>
        <div className="flex items-center space-x-2">
          <label htmlFor="language-select" className="text-sm text-gray-700">
            Language:
          </label>
          <select
            id="language-select"
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white text-gray-800 hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
          accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rb,.php,.html,.css,.rs,.md,.json,.xml,.sql"
        />
        <label
          htmlFor="file-upload"
          className="mt-4 inline-block px-4 py-2 bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 cursor-pointer"
        >
          Browse files
        </label>
        {filename && (
          <div className="mt-2 text-sm text-green-700">
            Selected file: <span className="font-medium">{filename}</span>
          </div>
        )}
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
              onChange={handleCodeChange}
              placeholder="// Paste or type your code here"
            />
          </div>
          
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {code ? 
                `Language: ${selectedLanguage.name} ${filename ? `• File: ${filename}` : ''}` 
                : ''}
            </div>
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