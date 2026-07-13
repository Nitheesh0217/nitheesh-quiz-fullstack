// Tests for: src/components/LoadingSpinner.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

afterEach(() => {
  cleanup();
});

describe('LoadingSpinner', () => {
  it('renders a loading message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });
});
