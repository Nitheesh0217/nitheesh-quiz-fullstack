// Tests for: src/app/error.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import GlobalError from './error';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GlobalError', () => {
  it('logs the error and renders a fallback UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(spy).toHaveBeenCalledWith(error);
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('500')).toBeDefined();
  });

  it('calls reset() when Try Again is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('links back to the dashboard', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);

    const links = screen.getAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === '/dashboard')).toBe(true);
  });
});
