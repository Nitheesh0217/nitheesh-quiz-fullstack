'use client';

import React, { createContext, useContext } from 'react';

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface DashboardLayoutContextType {
  title: string;
  setTitle: (title: string) => void;
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
  action: React.ReactNode;
  setAction: (action: React.ReactNode) => void;
  isFocusMode: boolean;
  setIsFocusMode: (focus: boolean) => void;
}

export const DashboardLayoutContext = createContext<DashboardLayoutContextType | undefined>(undefined);

export function useDashboardLayout() {
  const context = useContext(DashboardLayoutContext);
  if (!context) {
    throw new Error('useDashboardLayout must be used within a DashboardLayoutProvider');
  }
  return context;
}
