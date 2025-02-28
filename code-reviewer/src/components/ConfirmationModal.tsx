/**
 * Confirmation modal component for user confirmations.
 * Provides a more user-friendly alternative to browser alerts.
 */
import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: 'red' | 'blue' | 'green';
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonColor = 'red',
  isOpen,
  onConfirm,
  onCancel
}: ConfirmationModalProps) {
  const { theme } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onCancel]);
  
  // Handle outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node) && isOpen) {
        onCancel();
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onCancel]);
  
  // Focus trap when modal opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [isOpen]);
  
  // Get confirm button color classes
  const getConfirmButtonClasses = () => {
    switch (confirmButtonColor) {
      case 'red':
        return theme === 'dark' 
          ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white' 
          : 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white';
      case 'green':
        return theme === 'dark' 
          ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white' 
          : 'bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white';
      case 'blue':
      default:
        return theme === 'dark' 
          ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white' 
          : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white';
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity"></div>
      
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal */}
        <div 
          ref={modalRef}
          className={`
            relative rounded-lg shadow-xl 
            ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'}
            w-full max-w-md transform transition-all
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-headline"
        >
          {/* Modal header */}
          <div className={`px-6 pt-5 pb-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 
              className="text-lg font-medium leading-6" 
              id="modal-headline"
            >
              {title}
            </h3>
          </div>
          
          {/* Modal body */}
          <div className="px-6 py-3">
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
              {message}
            </p>
          </div>
          
          {/* Modal footer */}
          <div className={`
            px-6 py-4 flex justify-end gap-3
            ${theme === 'dark' ? 'border-t border-gray-700' : 'border-t border-gray-200'}
          `}>
            <button
              type="button"
              className={`
                px-4 py-2 text-sm font-medium rounded-md
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${theme === 'dark' 
                  ? 'bg-gray-700 hover:bg-gray-600 focus:ring-gray-500 text-gray-200' 
                  : 'bg-gray-200 hover:bg-gray-300 focus:ring-gray-500 text-gray-700'
                }
              `}
              onClick={onCancel}
            >
              {cancelText}
            </button>
            <button
              type="button"
              className={`
                px-4 py-2 text-sm font-medium rounded-md
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${getConfirmButtonClasses()}
              `}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}