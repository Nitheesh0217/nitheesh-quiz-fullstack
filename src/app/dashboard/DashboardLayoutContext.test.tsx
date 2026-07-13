// Tests for: src/app/dashboard/DashboardLayoutContext.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { DashboardLayoutContext, useDashboardLayout } from './DashboardLayoutContext';

afterEach(() => {
  cleanup();
});

function Consumer() {
  const { title } = useDashboardLayout();
  return <div>{title}</div>;
}

describe('useDashboardLayout', () => {
  it('returns the provided context value', () => {
    render(
      <DashboardLayoutContext.Provider
        value={{
          title: 'My Title',
          setTitle: vi.fn(),
          breadcrumbs: [],
          setBreadcrumbs: vi.fn(),
          action: null,
          setAction: vi.fn(),
          isFocusMode: false,
          setIsFocusMode: vi.fn(),
        }}
      >
        <Consumer />
      </DashboardLayoutContext.Provider>
    );

    expect(screen.getByText('My Title')).toBeDefined();
  });

  it('throws when used outside of a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      'useDashboardLayout must be used within a DashboardLayoutProvider'
    );
    spy.mockRestore();
  });
});
