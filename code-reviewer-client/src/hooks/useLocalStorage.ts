import { useState, useEffect } from 'react';

/**
 * Custom hook to persist state in localStorage
 * @param key - The localStorage key
 * @param initialValue - Initial value if no value exists in localStorage
 * @returns A tuple with the current value and a setter function
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  
  // Initialize on client-side only
  useEffect(() => {
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      
      // Parse stored json or return initialValue if none
      const value = item ? JSON.parse(item) : initialValue;
      
      setStoredValue(value);
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      setStoredValue(initialValue);
    }
  }, [key, initialValue]);
  
  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function for same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
        
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };
  
  // Update stored value if localStorage changes in another tab
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === key && event.newValue) {
        try {
          const newValue = JSON.parse(event.newValue);
          if (JSON.stringify(newValue) !== JSON.stringify(storedValue)) {
            setStoredValue(newValue);
          }
        } catch (e) {
          console.error(`Error parsing storage event for key "${key}":`, e);
        }
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
    
    return undefined;
  }, [key, storedValue]);
  
  return [storedValue, setValue];
}