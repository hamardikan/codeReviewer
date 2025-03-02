"use client";

import React, { createContext, useContext} from "react";

// Context for tab state management
interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

// Hook to use tabs context
function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

// Props for Tabs component
interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

// Root Tabs component
export function Tabs({ value, onValueChange, children, className = "" }: TabsProps) {
  return (
    <TabsContext.Provider value={{ activeTab: value, setActiveTab: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// Props for TabsList component
interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

// TabsList component
export function TabsList({ children, className = "" }: TabsListProps) {
  return <div className={`flex ${className}`}>{children}</div>;
}

// Props for TabsTrigger component
interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

// TabsTrigger component
export function TabsTrigger({ value, children, className = "", disabled = false }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === value}
      disabled={disabled}
      className={`${className} ${activeTab === value ? "data-[state=active]" : ""}`}
      onClick={() => !disabled && setActiveTab(value)}
    >
      {children}
    </button>
  );
}

// Props for TabsContent component
interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

// TabsContent component
export function TabsContent({ value, children, className = "" }: TabsContentProps) {
  const { activeTab } = useTabsContext();
  
  if (activeTab !== value) {
    return null;
  }
  
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}