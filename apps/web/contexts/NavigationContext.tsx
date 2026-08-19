'use client';

import React, { createContext, useContext, useState } from 'react';

interface NavigationContextType {
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  return (
    <NavigationContext.Provider value={{ isMobileNavOpen, setIsMobileNavOpen }}>
      {children}
    </NavigationContext.Provider>
  );
};

export function useNavigationMenu() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigationMenu must be used within a NavigationProvider');
  }
  return context;
}
