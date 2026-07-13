// Tests for: src/app/dashboard/teacher/assignments/[id]/grade/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import TeacherGradeRedirectPage from './page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useParams: () => ({ id: 'assign-1' }),
}));

describe('TeacherGradeRedirectPage', () => {
  it('redirects to the assignment detail page and renders a spinner', () => {
    const { container } = render(<TeacherGradeRedirectPage />);

    expect(mockReplace).toHaveBeenCalledWith('/dashboard/teacher/assignments/assign-1');
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });
});
