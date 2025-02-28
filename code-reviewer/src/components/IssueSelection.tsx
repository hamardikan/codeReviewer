/**
 * Issue Selection component for senior developers to review and approve issues.
 * Provides an interface to select which issues should be fixed in the implementation phase.
 */
import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CodeIssueDetectionResponse } from '@/lib/gemini';
import Toast, { ToastType } from '@/components/Toast';
import ConfirmationModal from '@/components/ConfirmationModal';

interface IssueSelectionProps {
  detectionResult: CodeIssueDetectionResponse;
  onImplement: (approvedIssues: string[], seniorFeedback: Record<string, string>) => void;
  onCancel: () => void;
  originalCode: string;
  language: string;
}

export default function IssueSelection({
  detectionResult,
  onImplement,
  onCancel,
  originalCode,
  language
}: IssueSelectionProps) {
  const { theme } = useTheme();
  // Ensure unique issue IDs by assigning new ones if needed
  const [issues, setIssues] = useState<CodeIssueDetectionResponse['issues']>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [showFeedback, setShowFeedback] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    action: 'implement' | 'cancel';
  }>({ isOpen: false, action: 'implement' });
  const [selectAll, setSelectAll] = useState(true);
  const [issueFilter, setIssueFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Ensure unique issue IDs on component mount
  useEffect(() => {
    // Create a map to track used IDs
    const usedIds = new Set<string>();
    
    // Process issues to ensure uniqueness
    const processedIssues = detectionResult.issues.map((issue, index) => {
      // If ID is missing or duplicate, generate a new one
      if (!issue.id || usedIds.has(issue.id)) {
        const newId = `issue-${index.toString().padStart(3, '0')}`;
        return { ...issue, id: newId, approved: true };
      }
      
      // Track this ID as used
      usedIds.add(issue.id);
      return { ...issue, approved: true };
    });
    
    setIssues(processedIssues);
  }, [detectionResult.issues]);

  // Toggle issue approval
  const toggleIssueApproval = (id: string) => {
    setIssues(prevIssues => 
      prevIssues.map(issue => 
        issue.id === id ? { ...issue, approved: !issue.approved } : issue
      )
    );
  };

  // Toggle all issues
  const toggleAllIssues = () => {
    const newValue = !selectAll;
    setSelectAll(newValue);
    setIssues(prevIssues => 
      prevIssues.map(issue => ({ ...issue, approved: newValue }))
    );
  };

  // Update feedback for an issue
  const updateFeedback = (id: string, value: string) => {
    setFeedback(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Toggle feedback input for an issue
  const toggleFeedbackInput = (id: string) => {
    setShowFeedback(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Handle implementation confirmation
  const handleImplement = () => {
    // Get approved issue IDs
    const approvedIssueIds = issues
      .filter(issue => issue.approved)
      .map(issue => issue.id);
    
    if (approvedIssueIds.length === 0) {
      setToast({
        message: 'Please select at least one issue to fix',
        type: 'error'
      });
      return;
    }
    
    // Filter feedback to only include approved issues
    const approvedFeedback: Record<string, string> = {};
    for (const id of approvedIssueIds) {
      if (feedback[id]) {
        approvedFeedback[id] = feedback[id];
      }
    }
    
    // Pass approved issues to parent component
    onImplement(approvedIssueIds, approvedFeedback);
  };

  // Get filtered issues
  const getFilteredIssues = () => {
    return issues.filter(issue => {
      // Filter by type
      if (issueFilter !== 'all' && issue.type !== issueFilter) {
        return false;
      }
      
      // Filter by severity
      if (severityFilter !== 'all' && issue.severity !== severityFilter) {
        return false;
      }
      
      return true;
    });
  };

  // Get unique issue types for filtering
  const issueTypes = ['all', ...Array.from(new Set(issues.map(issue => issue.type)))];
  
  // Get unique severities for filtering
  const severities = ['all', ...Array.from(new Set(issues.map(issue => issue.severity)))];

  // Count approved issues
  const approvedCount = issues.filter(issue => issue.approved).length;

  return (
    <div className="w-full space-y-6">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      
      {/* Confirmation modal */}
      {confirmationModal.isOpen && confirmationModal.action === 'implement' && (
        <ConfirmationModal
          title="Implement Selected Changes"
          message={`Are you ready to implement ${approvedCount} selected issues? This will generate improved code based on your selections.`}
          confirmText="Implement Changes"
          confirmButtonColor="blue"
          isOpen={true}
          onConfirm={() => {
            setConfirmationModal({ isOpen: false, action: 'implement' });
            handleImplement();
          }}
          onCancel={() => setConfirmationModal({ isOpen: false, action: 'implement' })}
        />
      )}
      
      {confirmationModal.isOpen && confirmationModal.action === 'cancel' && (
        <ConfirmationModal
          title="Cancel Review"
          message="Are you sure you want to cancel? Your selections will not be saved."
          confirmText="Yes, Cancel"
          confirmButtonColor="red"
          isOpen={true}
          onConfirm={() => {
            setConfirmationModal({ isOpen: false, action: 'cancel' });
            onCancel();
          }}
          onCancel={() => setConfirmationModal({ isOpen: false, action: 'cancel' })}
        />
      )}
      
      {/* Header */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
        <h2 className="text-xl font-semibold mb-2">Senior Developer Review</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select which issues you want to fix and provide optional feedback for the implementation.
        </p>
        
        {detectionResult.codeQualityScore && (
          <div className="mt-4 flex flex-wrap gap-4">
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className="text-xs text-gray-500">Overall Quality</div>
              <div className="font-semibold text-lg">
                {detectionResult.codeQualityScore.overall}/100
              </div>
            </div>
            
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className="text-xs text-gray-500">Readability</div>
              <div className="font-semibold">
                {detectionResult.codeQualityScore.categories.readability}/100
              </div>
            </div>
            
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className="text-xs text-gray-500">Maintainability</div>
              <div className="font-semibold">
                {detectionResult.codeQualityScore.categories.maintainability}/100
              </div>
            </div>
            
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className="text-xs text-gray-500">Simplicity</div>
              <div className="font-semibold">
                {detectionResult.codeQualityScore.categories.simplicity}/100
              </div>
            </div>
            
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className="text-xs text-gray-500">Consistency</div>
              <div className="font-semibold">
                {detectionResult.codeQualityScore.categories.consistency}/100
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Filtering and actions */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={toggleAllIssues}
              className="rounded text-blue-600"
            />
            <span>Select All Issues</span>
          </label>
          
          <div className="flex items-center space-x-2">
            <span>Issue Type:</span>
            <select
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value)}
              className={`py-1 px-2 rounded border ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            >
              {issueTypes.map((type, index) => (
                <option key={`type-${index}`} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <span>Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className={`py-1 px-2 rounded border ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            >
              {severities.map((severity, index) => (
                <option key={`severity-${index}`} value={severity}>{severity}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="text-sm">
          <span className="font-medium">{approvedCount}</span> of {issues.length} issues selected
        </div>
      </div>
      
      {/* Issues list */}
      <div className="space-y-4">
        {getFilteredIssues().map((issue, index) => (
          <div
            key={`issue-${issue.id}-${index}`}
            className={`p-4 rounded-lg border-l-4 ${
              issue.severity === 'critical'
                ? theme === 'dark'
                  ? 'border-red-600 bg-red-900 bg-opacity-20'
                  : 'border-red-500 bg-red-50'
                : issue.severity === 'high'
                  ? theme === 'dark'
                    ? 'border-orange-600 bg-orange-900 bg-opacity-20'
                    : 'border-orange-500 bg-orange-50'
                  : issue.severity === 'medium'
                    ? theme === 'dark'
                      ? 'border-yellow-600 bg-yellow-900 bg-opacity-20'
                      : 'border-yellow-500 bg-yellow-50'
                    : theme === 'dark'
                      ? 'border-blue-600 bg-blue-900 bg-opacity-20'
                      : 'border-blue-500 bg-blue-50'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={issue.approved}
                    onChange={() => toggleIssueApproval(issue.id)}
                    className="rounded text-blue-600 w-5 h-5"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-lg">{issue.type}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      issue.severity === 'critical'
                        ? 'bg-red-500 text-white'
                        : issue.severity === 'high'
                          ? theme === 'dark'
                            ? 'bg-orange-800 text-orange-100' 
                            : 'bg-orange-100 text-orange-800'
                          : issue.severity === 'medium'
                            ? theme === 'dark'
                              ? 'bg-yellow-800 text-yellow-100'
                              : 'bg-yellow-100 text-yellow-800'
                            : theme === 'dark'
                              ? 'bg-blue-800 text-blue-100'
                              : 'bg-blue-100 text-blue-800'
                    }`}>
                      {issue.severity}
                    </span>
                  </div>
                  <p className="mt-1">{issue.description}</p>
                  
                  {issue.lineNumbers && issue.lineNumbers.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Lines: </span>
                      {issue.lineNumbers.join(', ')}
                    </div>
                  )}
                  
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Impact: </span>
                    {issue.impact}
                  </div>
                  
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Proposed Solution: </span>
                    {issue.proposedSolution}
                  </div>
                  
                  {/* Toggle feedback input */}
                  <button
                    onClick={() => toggleFeedbackInput(issue.id)}
                    className={`mt-3 text-sm px-3 py-1 rounded ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {showFeedback[issue.id] ? 'Hide Feedback' : 'Add Feedback'}
                  </button>
                  
                  {/* Feedback input */}
                  {showFeedback[issue.id] && (
                    <div className="mt-3">
                      <textarea
                        value={feedback[issue.id] || ''}
                        onChange={(e) => updateFeedback(issue.id, e.target.value)}
                        placeholder="Add your guidance for implementing this fix..."
                        className={`w-full p-2 rounded border ${
                          theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300'
                        }`}
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Code reference - would be expanded in a more sophisticated implementation */}
              {issue.lineNumbers && issue.lineNumbers.length > 0 && (
                <button
                  className={`text-xs flex items-center ${
                    theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                  }`}
                  title="View code"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Actions footer */}
      <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setConfirmationModal({ isOpen: true, action: 'cancel' })}
          className={`px-4 py-2 rounded-lg ${
            theme === 'dark'
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Cancel
        </button>
        
        <button
          onClick={() => setConfirmationModal({ isOpen: true, action: 'implement' })}
          disabled={approvedCount === 0}
          className={`px-6 py-2 rounded-lg font-medium ${
            approvedCount === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Implement {approvedCount} {approvedCount === 1 ? 'Change' : 'Changes'}
        </button>
      </div>
    </div>
  );
}