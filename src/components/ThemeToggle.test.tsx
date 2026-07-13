// Tests for: src/components/ThemeToggle.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark', 'light');
  localStorage.clear();
});

beforeEach(() => {
  document.documentElement.classList.remove('dark', 'light');
});

describe('ThemeToggle', () => {
  it('renders the Dark label when the document is not currently dark', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button').textContent).toContain('Dark');
  });

  it('renders the Light label when the document already has the dark class', () => {
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button').textContent).toContain('Light');
  });

  it('switches to dark mode and persists the preference on click', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByRole('button').textContent).toContain('Light');
  });

  it('switches back to light mode on a second click', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
