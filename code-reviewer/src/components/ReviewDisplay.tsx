/**
 * Enhanced Review display component for showing code review results.
 * Implements a GitHub-style diff view with expandable sections and line numbers for better navigation.
 */
import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CodeReviewResponse, CodeChangeSection } from '@/lib/gemini';
import Toast, { ToastType } from '@/components/Toast';

interface ReviewDisplayProps {
  originalCode: string;
  review: CodeReviewResponse;
  language: string;
}

export default function ReviewDisplay({
  originalCode,
  review,
  language
}: ReviewDisplayProps) {
  const { theme } = useTheme();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<string>>(new Set());
  const [codeSections, setCodeSections] = useState<CodeChangeSection[]>([]);
  const [customCode, setCustomCode] = useState<string>(originalCode);
  
  // Track if any changes have been made
  const [changesMade, setChangesMade] = useState<boolean>(false);

  // Process the review data and generate code sections if they don't exist
  useEffect(() => {
    if (review.codeSections && review.codeSections.length > 0) {
      setCodeSections(review.codeSections);
    } else {
      // Generate code sections from the review data
      const sections = generateCodeSections(originalCode, review);
      setCodeSections(sections);
    }
  }, [review, originalCode]);

  // Stats counts
  const changesCount = codeSections.filter(section => section.type === 'changed').length;
  const issuesCount = review.issues ? review.issues.length : 0;
  const suggestionsCount = review.suggestions ? review.suggestions.length : 0;

  // Copy code to clipboard with toast notification
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setToast({ message: 'Code copied to clipboard!', type: 'success' });
      })
      .catch((error) => {
        console.error('Error copying text: ', error);
        setToast({ message: 'Failed to copy code', type: 'error' });
      });
  };

  // Toggle expanded section
  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  // Toggle expanded issue
  const toggleIssue = (index: number) => {
    setExpandedIssue(expandedIssue === index ? null : index);
  };

  // Handle accepting a change
  const acceptChange = (id: string) => {
    setAcceptedChanges(prev => {
      const updated = new Set(prev);
      updated.add(id);
      return updated;
    });
    setRejectedChanges(prev => {
      const updated = new Set(prev);
      updated.delete(id);
      return updated;
    });
    setChangesMade(true);
    setToast({ message: 'Change accepted', type: 'success' });
  };

  // Handle rejecting a change
  const rejectChange = (id: string) => {
    setRejectedChanges(prev => {
      const updated = new Set(prev);
      updated.add(id);
      return updated;
    });
    setAcceptedChanges(prev => {
      const updated = new Set(prev);
      updated.delete(id);
      return updated;
    });
    setChangesMade(true);
    setToast({ message: 'Change rejected', type: 'error' });
  };

  // Accept all changes
  const acceptAllChanges = () => {
    const changedSectionIds = codeSections
      .filter(section => section.type === 'changed')
      .map(section => section.id);
    
    setAcceptedChanges(new Set(changedSectionIds));
    setRejectedChanges(new Set());
    setChangesMade(true);
    setToast({ message: 'All changes accepted', type: 'success' });
  };

  // Reject all changes
  const rejectAllChanges = () => {
    const changedSectionIds = codeSections
      .filter(section => section.type === 'changed')
      .map(section => section.id);
    
    setRejectedChanges(new Set(changedSectionIds));
    setAcceptedChanges(new Set());
    setChangesMade(true);
    setToast({ message: 'All changes rejected', type: 'error' });
  };

  // Reset to unchanged state
  const resetChanges = () => {
    setAcceptedChanges(new Set());
    setRejectedChanges(new Set());
    setChangesMade(false);
    setToast({ message: 'Reset to original state', type: 'info' });
  };

  // Update the custom code based on accepted/rejected changes
  const updateCustomCode = () => {
    let finalCode = '';
    
    for (const section of codeSections) {
      if (section.type === 'unchanged' || acceptedChanges.has(section.id)) {
        finalCode += section.content;
      } else if (section.type === 'changed' && section.original) {
        finalCode += section.original;
      } else {
        // If it's a changed section with no original (new addition), use the content
        finalCode += section.content;
      }
    }
    
    setCustomCode(finalCode);
  };

  // Effect to update custom code whenever accepted/rejected changes are updated
  useEffect(() => {
    updateCustomCode();
  }, [acceptedChanges, rejectedChanges, codeSections]);

  // Grouped changes by clean code principle
  const getPrincipleGroups = () => {
    const groups: {[key: string]: number} = review.cleanCodePrinciples || {};
    
    if (Object.keys(groups).length === 0) {
      // If no principles are provided, count them from code sections
      codeSections.forEach(section => {
        if (section.type === 'changed' && section.cleanCodePrinciple) {
          groups[section.cleanCodePrinciple] = (groups[section.cleanCodePrinciple] || 0) + 1;
        }
      });
    }
    
    return groups;
  };

  const principleGroups = getPrincipleGroups();

  // Action buttons group for reuse at top and bottom
  const ActionButtons = () => (
    <div className="flex space-x-2">
      <button
        onClick={() => copyToClipboard(customCode)}
        className={`px-4 py-2 rounded text-sm ${
          theme === 'dark'
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        Copy Final Code
      </button>
      <button
        onClick={acceptAllChanges}
        className={`px-4 py-2 rounded text-sm ${
          theme === 'dark'
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        Accept All
      </button>
      <button
        onClick={rejectAllChanges}
        className={`px-4 py-2 rounded text-sm ${
          theme === 'dark'
            ? 'border border-gray-600 hover:bg-gray-700 text-gray-200'
            : 'border border-gray-300 hover:bg-gray-100 text-gray-700'
        }`}
      >
        Reject All
      </button>
      {changesMade && (
        <button
          onClick={resetChanges}
          className={`px-4 py-2 rounded text-sm ${
            theme === 'dark'
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
        >
          Reset
        </button>
      )}
    </div>
  );

  return (
    <div className="w-full">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header with file info and actions */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h2 className="text-xl font-bold">Code Review: {language}</h2>
          <div className="flex ml-3 space-x-2">
            <span className={`px-2 py-0.5 rounded text-sm ${
              theme === 'dark' 
                ? 'bg-red-900 bg-opacity-30 text-red-200' 
                : 'bg-red-100 text-red-800'
            }`}>
              {issuesCount} {issuesCount === 1 ? 'issue' : 'issues'}
            </span>
            <span className={`px-2 py-0.5 rounded text-sm ${
              theme === 'dark' 
                ? 'bg-green-900 bg-opacity-30 text-green-200' 
                : 'bg-green-100 text-green-800'
            }`}>
              {suggestionsCount} {suggestionsCount === 1 ? 'suggestion' : 'suggestions'}
            </span>
            <span className={`px-2 py-0.5 rounded text-sm ${
              theme === 'dark' 
                ? 'bg-blue-900 bg-opacity-30 text-blue-200' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {changesCount} {changesCount === 1 ? 'change' : 'changes'}
            </span>
          </div>
        </div>
        <ActionButtons />
      </div>
      
      {/* Instructions */}
      <div className={`mb-4 text-sm ${
        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
      }`}>
        Click on highlighted sections to see the original code and explanation. Accept or reject changes to see the effect immediately.
      </div>
      
      {/* Review summary */}
      <div className={`p-4 rounded-lg mb-6 ${
        theme === 'dark' 
          ? 'bg-gray-800 border border-gray-700' 
          : 'bg-white border border-gray-200 shadow-sm'
      }`}>
        <h3 className="text-lg font-semibold mb-2">Summary</h3>
        <p>{review.summary}</p>
      </div>

      {/* Issues Panel */}
      {review.issues && review.issues.length > 0 && (
        <div className={`mb-6 border rounded-lg overflow-hidden ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <div className={`p-3 ${
            theme === 'dark' 
              ? 'bg-gray-800 border-b border-gray-700' 
              : 'bg-gray-100 border-b border-gray-300'
          }`}>
            <h3 className="font-semibold">Identified Issues ({review.issues.length})</h3>
          </div>
          <div className={theme === 'dark' ? 'bg-gray-900' : 'bg-white'}>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {review.issues.map((issue, index) => (
                <div key={index} className="p-3">
                  <div 
                    className={`flex justify-between items-start cursor-pointer ${
                      expandedIssue === index ? '' : 'mb-0'
                    }`}
                    onClick={() => toggleIssue(index)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`px-2 py-1 text-xs font-medium rounded ${
                        issue.severity === 'critical' || issue.severity === 'high'
                          ? theme === 'dark'
                            ? 'bg-red-900 bg-opacity-30 text-red-200'
                            : 'bg-red-100 text-red-800'
                          : issue.severity === 'medium'
                            ? theme === 'dark'
                              ? 'bg-yellow-900 bg-opacity-30 text-yellow-200'
                              : 'bg-yellow-100 text-yellow-800'
                            : theme === 'dark'
                              ? 'bg-blue-900 bg-opacity-30 text-blue-200'
                              : 'bg-blue-100 text-blue-800'
                      }`}>
                        {issue.severity}
                      </div>
                      <div className="font-medium">{issue.type}</div>
                    </div>
                    <button className="text-sm">
                      {expandedIssue === index ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                  </div>
                  
                  {expandedIssue === index && (
                    <div className="mt-3">
                      <p className="text-sm mb-2">{issue.description}</p>
                      {issue.impact && (
                        <div className="mt-2">
                          <div className={`text-xs font-medium mb-1 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                          }`}>Impact:</div>
                          <p className="text-sm">{issue.impact}</p>
                        </div>
                      )}
                      {issue.lineNumbers && issue.lineNumbers.length > 0 && (
                        <div className="mt-2 text-sm">
                          <span className="font-medium">Lines: </span>
                          {issue.lineNumbers.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Preview the custom code if changes have been made */}
      {changesMade && (
        <div className={`mb-6 border rounded-lg overflow-hidden ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <div className={`flex justify-between items-center p-3 ${
            theme === 'dark' 
              ? 'bg-gray-800 border-b border-gray-700' 
              : 'bg-gray-100 border-b border-gray-300'
          }`}>
            <div className="font-medium">Preview with Your Changes</div>
            <button
              onClick={() => copyToClipboard(customCode)}
              className={`text-sm ${
                theme === 'dark'
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-blue-600 hover:text-blue-800'
              }`}
            >
              Copy Code
            </button>
          </div>
          <div className={theme === 'dark' ? 'bg-gray-900' : 'bg-white'}>
            <div className="flex overflow-auto max-h-96">
              {/* Line numbers */}
              <div className={`flex-none py-1 px-2 text-right whitespace-pre-wrap select-none ${
                theme === 'dark' ? 'bg-gray-800 text-gray-500 border-r border-gray-700' : 'bg-gray-100 text-gray-500 border-r border-gray-300'
              }`} style={{ minWidth: '3rem' }}>
                {customCode.split('\n').map((_, i) => (
                  <div key={i} className="leading-relaxed">{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <pre className={`py-1 px-4 whitespace-pre leading-relaxed overflow-visible ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-800'
              }`}>
                {customCode}
              </pre>
            </div>
          </div>
        </div>
      )}
      
      {/* Code view with changes */}
      <div className={`border rounded-lg overflow-hidden ${
        theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
      }`}>
        <div className={`flex justify-between items-center p-3 ${
          theme === 'dark' 
            ? 'bg-gray-800 border-b border-gray-700' 
            : 'bg-gray-100 border-b border-gray-300'
        }`}>
          <div className="font-medium">{language} Code with Changes ({changesCount})</div>
          <div className={`text-sm ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            Click on sections to see details
          </div>
        </div>
        
        <div className={theme === 'dark' ? 'bg-gray-900' : 'bg-white'}>
          {codeSections.map((section, sectionIndex) => {
            // Calculate start line based on previous sections
            let startLine = 0;
            for (let i = 0; i < sectionIndex; i++) {
              const prevSection = codeSections[i];
              // Count lines in the section's content
              const content = (acceptedChanges.has(prevSection.id) || 
                              (prevSection.type === 'unchanged')) ? 
                              prevSection.content : 
                              (rejectedChanges.has(prevSection.id) && prevSection.original) ? 
                              prevSection.original : 
                              prevSection.content;
              
              startLine += content.split('\n').length;
            }
            
            // Get content based on accepted/rejected state
            const displayContent = (acceptedChanges.has(section.id) || 
                                   (section.type === 'unchanged')) ? 
                                   section.content : 
                                   (rejectedChanges.has(section.id) && section.original) ? 
                                   section.original : 
                                   section.content;
            
            // Count lines in the section for line numbering
            const lines = displayContent.split('\n');

            return (
              <div key={section.id} className="font-mono text-sm">
                {section.type === 'unchanged' ? (
                  // Unchanged code section with line numbers
                  <div className="flex">
                    {/* Line numbers */}
                    <div className={`flex-none py-1 px-2 text-right whitespace-pre-wrap select-none ${
                      theme === 'dark' ? 'bg-gray-800 text-gray-500 border-r border-gray-700' : 'bg-gray-100 text-gray-500 border-r border-gray-300'
                    }`} style={{ minWidth: '3rem' }}>
                      {lines.map((_, i) => (
                        <div key={i} className="leading-relaxed">{startLine + i + 1}</div>
                      ))}
                    </div>
                    {/* Code */}
                    <pre className={`py-1 px-4 whitespace-pre-wrap flex-1 leading-relaxed ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-800'
                    }`}>{section.content}</pre>
                  </div>
                ) : (
                  // Changed code section
                  <div>
                    {/* Highlighted section that expands on click */}
                    <div 
                      className={`
                        cursor-pointer
                        ${expandedSection === section.id 
                          ? theme === 'dark'
                            ? 'bg-blue-900 bg-opacity-30 rounded-t'
                            : 'bg-blue-100 rounded-t'
                          : theme === 'dark'
                            ? 'bg-green-900 bg-opacity-20 hover:bg-opacity-30 rounded'
                            : 'bg-green-100 hover:bg-green-200 rounded'
                        }
                        ${rejectedChanges.has(section.id)
                          ? theme === 'dark'
                            ? 'bg-red-900 bg-opacity-20 hover:bg-opacity-30'
                            : 'bg-red-100 hover:bg-red-200'
                          : ''
                        }
                        ${acceptedChanges.has(section.id)
                          ? theme === 'dark'
                            ? 'bg-green-900 bg-opacity-40 hover:bg-opacity-50'
                            : 'bg-green-200 hover:bg-green-300'
                          : ''
                        }
                      `}
                      onClick={() => toggleSection(section.id)}
                    >
                      <div className="flex">
                        {/* Line numbers */}
                        <div className={`flex-none py-2 px-2 text-right whitespace-pre-wrap select-none ${
                          theme === 'dark' ? 'bg-gray-800 bg-opacity-50 text-gray-400 border-r border-gray-700' : 'bg-gray-100 bg-opacity-70 text-gray-500 border-r border-gray-300'
                        }`} style={{ minWidth: '3rem' }}>
                          {lines.map((_, i) => (
                            <div key={i} className="leading-relaxed">{startLine + i + 1}</div>
                          ))}
                        </div>
                        
                        {/* Code with metadata */}
                        <div className="py-2 px-4 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              {section.cleanCodePrinciple && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  theme === 'dark'
                                    ? 'bg-green-900 bg-opacity-50 text-green-200'
                                    : 'bg-green-200 text-green-800'
                                }`}>
                                  {section.cleanCodePrinciple}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                acceptedChanges.has(section.id)
                                  ? theme === 'dark'
                                    ? 'bg-green-900 bg-opacity-50 text-green-200'
                                    : 'bg-green-200 text-green-800'
                                  : rejectedChanges.has(section.id)
                                    ? theme === 'dark'
                                      ? 'bg-red-900 bg-opacity-50 text-red-200'
                                      : 'bg-red-200 text-red-800'
                                    : theme === 'dark'
                                      ? 'bg-blue-900 bg-opacity-50 text-blue-200'
                                      : 'bg-blue-200 text-blue-800'
                              }`}>
                                {acceptedChanges.has(section.id) 
                                  ? 'Accepted' 
                                  : rejectedChanges.has(section.id) 
                                    ? 'Rejected'
                                    : 'Suggested'}
                              </span>
                              {section.lineNumbers && (
                                <span className={`text-xs ${
                                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                  Lines: {section.lineNumbers}
                                </span>
                              )}
                            </div>
                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          <pre className="whitespace-pre-wrap leading-relaxed">{displayContent}</pre>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded view showing diff */}
                    {expandedSection === section.id && (
                      <div className={`border rounded-b mb-2 ${
                        theme === 'dark' 
                          ? 'border-blue-800'
                          : 'border-blue-200'
                      }`}>
                        {/* Explanation */}
                        <div className={`p-3 ${
                          theme === 'dark'
                            ? 'bg-blue-900 bg-opacity-20 border-b border-blue-800'
                            : 'bg-blue-50 border-b border-blue-200'
                        }`}>
                          <div className="flex justify-between items-start">
                            <p className={`text-sm ${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                              {section.explanation}
                            </p>
                            <div className="flex space-x-2 ml-4">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  acceptChange(section.id);
                                }}
                                className={`px-3 py-1 rounded-md text-xs ${
                                  acceptedChanges.has(section.id)
                                    ? theme === 'dark'
                                      ? 'bg-gray-600 text-gray-200 cursor-default'
                                      : 'bg-gray-400 text-white cursor-default'
                                    : theme === 'dark'
                                      ? 'bg-green-600 hover:bg-green-700 text-white'
                                      : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                                disabled={acceptedChanges.has(section.id)}
                              >
                                {acceptedChanges.has(section.id) ? 'Accepted' : 'Accept'}
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rejectChange(section.id);
                                }}
                                className={`px-3 py-1 rounded-md text-xs ${
                                  rejectedChanges.has(section.id)
                                    ? theme === 'dark'
                                      ? 'bg-gray-600 text-gray-200 cursor-default'
                                      : 'bg-gray-400 text-white cursor-default'
                                    : theme === 'dark'
                                      ? 'border border-gray-600 hover:bg-gray-700'
                                      : 'border border-gray-300 hover:bg-gray-100'
                                }`}
                                disabled={rejectedChanges.has(section.id)}
                              >
                                {rejectedChanges.has(section.id) ? 'Rejected' : 'Reject'}
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Original code with line numbers */}
                        <div className={
                          theme === 'dark'
                            ? 'bg-red-900 bg-opacity-20 border-b border-blue-800'
                            : 'bg-red-50 border-b border-blue-200'
                        }>
                          <div className={`px-3 py-2 ${
                            theme === 'dark' ? 'text-red-300' : 'text-red-800'
                          }`}>Original Code:</div>
                          
                          <div className="flex">
                            {/* Line numbers */}
                            <div className={`flex-none py-1 px-2 text-right whitespace-pre-wrap select-none ${
                              theme === 'dark' ? 'bg-red-900 bg-opacity-10 text-red-400 border-r border-red-900' : 'bg-red-50 text-red-500 border-r border-red-200'
                            }`} style={{ minWidth: '3rem' }}>
                              {section.original ? section.original.split('\n').map((_, i) => (
                                <div key={i} className="leading-relaxed">{startLine + i + 1}</div>
                              )) : <div className="leading-relaxed">{startLine + 1}</div>}
                            </div>
                            {/* Code */}
                            <pre className={`p-2 whitespace-pre-wrap font-mono ${
                              theme === 'dark' ? 'text-red-300' : 'text-red-800'
                            }`}>
                              {section.original || '(No code - this is a new addition)'}
                            </pre>
                          </div>
                        </div>
                        
                        {/* Improved code with line numbers */}
                        <div className={
                          theme === 'dark'
                            ? 'bg-green-900 bg-opacity-20'
                            : 'bg-green-50'
                        }>
                          <div className={`px-3 py-2 ${
                            theme === 'dark' ? 'text-green-300' : 'text-green-800'
                          }`}>Improved Code:</div>
                          
                          <div className="flex">
                            {/* Line numbers */}
                            <div className={`flex-none py-1 px-2 text-right whitespace-pre-wrap select-none ${
                              theme === 'dark' ? 'bg-green-900 bg-opacity-10 text-green-400 border-r border-green-900' : 'bg-green-50 text-green-500 border-r border-green-200'
                            }`} style={{ minWidth: '3rem' }}>
                              {section.content.split('\n').map((_, i) => (
                                <div key={i} className="leading-relaxed">{startLine + i + 1}</div>
                              ))}
                            </div>
                            {/* Code */}
                            <pre className={`p-2 whitespace-pre-wrap font-mono ${
                              theme === 'dark' ? 'text-green-300' : 'text-green-800'
                            }`}>
                              {section.content}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Summary footer */}
      <div className={`mt-6 p-4 border rounded-lg ${
        theme === 'dark' 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <h3 className="font-semibold mb-2">Review Summary</h3>
        <p className={`text-sm mb-3 ${
          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
        }`}>
          The analysis found {issuesCount} issues and {suggestionsCount} suggestions, resulting in {changesCount} code changes following clean code principles:
        </p>
        
        {Object.keys(principleGroups).length > 0 && (
          <ul className={`text-sm mb-3 list-disc pl-5 space-y-1 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          }`}>
            {Object.entries(principleGroups).map(([principle, count]) => (
              <li key={principle}>
                <strong>{principle}:</strong> {count} {count === 1 ? 'change' : 'changes'}
              </li>
            ))}
          </ul>
        )}
        
        {/* Bottom action buttons */}
        <div className="flex justify-end mt-4">
          <ActionButtons />
        </div>
      </div>
    </div>
  );
}

/**
 * Generate code sections from original code and review data.
 * This function tries to split the code into unchanged and changed sections
 * based on the suggestions in the review.
 */
function generateCodeSections(
  originalCode: string,
  review: CodeReviewResponse
): CodeChangeSection[] {
  // If the review already has code sections, use them
  if (review.codeSections && review.codeSections.length > 0) {
    return review.codeSections;
  }
  
  const sections: CodeChangeSection[] = [];
  
  // If there are no suggestions, just return the original code as one unchanged section
  if (!review.suggestions || review.suggestions.length === 0) {
    return [{
      id: 'section-original',
      type: 'unchanged',
      content: originalCode
    }];
  }

  // Sort suggestions by their position in the code (heuristic-based)
  const suggestions = [...review.suggestions].sort((a, b) => {
    const posA = originalCode.indexOf(a.before);
    const posB = originalCode.indexOf(b.before);
    return posA - posB;
  });
  
  let remainingCode = originalCode;
  let processedCode = '';
  let currentPosition = 0;
  
  // Process each suggestion
  for (const suggestion of suggestions) {
    const beforePos = originalCode.indexOf(suggestion.before, currentPosition);
    
    // Skip if pattern not found or already processed
    if (beforePos === -1 || beforePos < currentPosition) continue;
    
    // Add any code before this suggestion as unchanged
    if (beforePos > currentPosition) {
      const unchangedContent = originalCode.substring(currentPosition, beforePos);
      if (unchangedContent.trim()) {
        sections.push({
          id: `unchanged-${sections.length}`,
          type: 'unchanged',
          content: unchangedContent
        });
      }
      processedCode += unchangedContent;
    }
    
    // Add the changed section
    sections.push({
      id: `changed-${sections.length}`,
      type: 'changed',
      content: suggestion.after,
      original: suggestion.before,
      explanation: suggestion.description + (suggestion.benefits ? `\n\nBenefits: ${suggestion.benefits}` : ''),
      cleanCodePrinciple: getCategoryFromDescription(suggestion.description),
      lineNumbers: getLineNumbersForCode(originalCode, suggestion.before)
    });
    
    processedCode += suggestion.after;
    currentPosition = beforePos + suggestion.before.length;
  }
  
  // Add any remaining code as unchanged
  if (currentPosition < originalCode.length) {
    const remainingContent = originalCode.substring(currentPosition);
    sections.push({
      id: `unchanged-${sections.length}`,
      type: 'unchanged',
      content: remainingContent
    });
  }
  
  // If no sections were created (due to issues with finding suggestions), fall back to a single section
  if (sections.length === 0) {
    return [{
      id: 'section-fallback',
      type: 'unchanged',
      content: originalCode
    }];
  }
  
  return sections;
}

/**
 * Helper function to determine line numbers for a code snippet
 */
function getLineNumbersForCode(fullCode: string, snippet: string): string {
  const lines = fullCode.split('\n');
  const snippetLines = snippet.trim().split('\n');
  
  for (let i = 0; i <= lines.length - snippetLines.length; i++) {
    let match = true;
    for (let j = 0; j < snippetLines.length; j++) {
      if (lines[i + j].trim() !== snippetLines[j].trim()) {
        match = false;
        break;
      }
    }
    
    if (match) {
      return snippetLines.length === 1 
        ? `${i + 1}` 
        : `${i + 1}-${i + snippetLines.length}`;
    }
  }
  
  return '';
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
    'comment': 'Comments',
    'documentation': 'Comments',
    'format': 'Formatting',
    'indentation': 'Formatting',
    'spacing': 'Formatting',
    'error': 'Error Handling',
    'exception': 'Error Handling',
    'validation': 'Error Handling',
    'duplicate': 'Simplicity',
    'complexity': 'Simplicity',
    'simplify': 'Simplicity',
    'performance': 'Performance',
    'efficient': 'Performance',
    'security': 'Security',
    'vulnerability': 'Security'
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