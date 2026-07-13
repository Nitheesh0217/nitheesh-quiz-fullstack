// Tests for: src/app/not-found.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import NotFound from './not-found';

afterEach(() => {
  cleanup();
});

describe('NotFound', () => {
  it('renders a 404 message with a link back to the dashboard', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeDefined();
    expect(screen.getByText('Page not found')).toBeDefined();
    const link = screen.getByRole('link', { name: /Back to Dashboard/i });
    expect(link.getAttribute('href')).toBe('/dashboard');
  });
});
