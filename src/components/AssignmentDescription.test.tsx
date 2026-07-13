// Tests for: src/components/AssignmentDescription.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { AssignmentDescription } from './AssignmentDescription';

afterEach(() => {
  cleanup();
});

describe('AssignmentDescription', () => {
  it('shows a placeholder when there is no description', () => {
    render(<AssignmentDescription description={null} />);
    expect(screen.getByText('No instructions provided.')).toBeDefined();
  });

  it('renders a markdown-style heading, bullet list, and plain paragraph in the fallback parser', () => {
    const description = '### Overview\n\nPlain paragraph text.\n\n- First item\n- Second item';
    render(<AssignmentDescription description={description} />);

    expect(screen.getByText('Overview')).toBeDefined();
    expect(screen.getByText('Plain paragraph text.')).toBeDefined();
    expect(screen.getByText('First item')).toBeDefined();
    expect(screen.getByText('Second item')).toBeDefined();
  });

  it('renders a teacher-written description verbatim even when it contains a seeded-course-topic phrase', () => {
    // Regression test: this component used to substring-match descriptions
    // against a fixed list of seeded course topics (e.g. "BGP routing",
    // "vulnerability analysis") and silently swap in unrelated canned
    // content instead of the real text. A real teacher writing their own
    // assignment on the same topic would have their instructions discarded.
    const description = 'Please complete the BGP routing lab exercise and submit your config by Friday.';
    render(<AssignmentDescription description={description} />);

    expect(screen.getByText(description)).toBeDefined();
    expect(screen.queryByText('💡 Coursework Objective')).toBeNull();
  });
});
