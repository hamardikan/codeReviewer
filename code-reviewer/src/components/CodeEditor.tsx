/**
 * Code editor component for inputting and editing code for review.
 * Supports syntax highlighting and file upload.
 */
import React, { useState, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  onLanguageChange: (language: string) => void;
}

export default function CodeEditor({
  code,
  language,
  onChange,
  onLanguageChange
}: CodeEditorProps) {
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('code.txt');

  // List of supported programming languages
  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'csharp', label: 'C#' },
    { value: 'cpp', label: 'C++' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
    { value: 'swift', label: 'Swift' },
    { value: 'kotlin', label: 'Kotlin' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
  ];

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Set the file name
    setFileName(file.name);

    // Determine language from file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension) {
      // Map file extensions to languages
      const extensionMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'cs': 'csharp',
        'cpp': 'cpp',
        'c': 'cpp',
        'h': 'cpp',
        'go': 'go',
        'rs': 'rust',
        'rb': 'ruby',
        'php': 'php',
        'swift': 'swift',
        'kt': 'kotlin',
        'html': 'html',
        'css': 'css',
      };

      const detectedLanguage = extensionMap[extension];
      if (detectedLanguage) {
        onLanguageChange(detectedLanguage);
      }
    }

    // Read the file content
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onChange(content);
    };
    reader.readAsText(file);
  };

  // Handle click on upload button
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle tab key in textarea
  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      // Insert tab at cursor position
      const newValue = code.substring(0, start) + '  ' + code.substring(end);
      onChange(newValue);

      // Move cursor position after the inserted tab
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="w-full">
      {/* Language selector and file upload */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <label 
            htmlFor="language-select" 
            className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mr-2`}
          >
            Language:
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className={`
              py-1 px-2 text-sm rounded border
              ${theme === 'dark' 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300 text-gray-900'
              }
            `}
          >
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleUploadClick}
          className={`
            flex items-center text-sm py-1 px-3 rounded border
            ${theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
            }
          `}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Upload File
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".js,.jsx,.ts,.tsx,.py,.java,.cs,.cpp,.c,.h,.go,.rs,.rb,.php,.swift,.kt,.html,.css,.txt"
          onChange={handleFileUpload}
        />
      </div>

      {/* Code editor */}
      <div className={`
        w-full rounded-lg border overflow-hidden
        ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}
      `}>
        {/* Editor header */}
        <div className={`
          flex items-center justify-between px-4 py-2 border-b
          ${theme === 'dark' 
            ? 'bg-gray-700 border-gray-700' 
            : 'bg-gray-100 border-gray-300'
          }
        `}>
          <div className="flex items-center">
            <span className="text-sm font-medium">{fileName}</span>
            <span 
              className={`
                ml-2 text-xs px-2 py-0.5 rounded
                ${theme === 'dark' 
                  ? 'bg-blue-900 text-blue-200' 
                  : 'bg-blue-100 text-blue-800'
                }
              `}
            >
              {languages.find(lang => lang.value === language)?.label || language}
            </span>
          </div>

          {/* Line count */}
          <div className="text-xs text-gray-500">
            {code.split('\n').length} lines
          </div>
        </div>

        {/* Code textarea */}
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleTabKey}
          className={`
            w-full h-96 p-4 font-mono text-sm resize-none outline-none
            ${theme === 'dark' 
              ? 'bg-gray-800 text-gray-200' 
              : 'bg-white text-gray-800'
            }
          `}
          placeholder="Paste your code here or upload a file..."
          spellCheck="false"
        />
      </div>
    </div>
  );
}