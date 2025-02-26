/**
 * Theme context for managing dark/light mode.
 * Provides theme state and toggle functionality throughout the application.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// Create the context with a default value
const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

// Storage key for theme preference
const THEME_STORAGE_KEY = 'code-review-app-theme';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize theme state
  const [theme, setThemeState] = useState<Theme>('light');
  
  // Load saved theme preference on initial render
  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Check for stored preference
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      
      // Check for system preference if no stored preference
      if (!storedTheme) {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setThemeState(systemPrefersDark ? 'dark' : 'light');
        return;
      }
      
      setThemeState(storedTheme || 'light');
    }
  }, []);
  
  // Update document when theme changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Save theme preference
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      
      // Update document class for CSS
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);
  
  // Function to toggle theme
  const toggleTheme = () => {
    setThemeState(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  // Function to set theme directly
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };
  
  // Provide theme context to children
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook for using theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}