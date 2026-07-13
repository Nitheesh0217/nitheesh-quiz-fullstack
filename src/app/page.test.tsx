// Tests for: src/app/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import LandingPage from './page';
import { useAuth } from '../components/AuthProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('LandingPage', () => {
  it('renders a loading indicator and does not redirect while the session check is in flight', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<LandingPage />);
    expect(screen.getByText('Loading Concentrate Portal...')).toBeDefined();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to /dashboard when a session already exists', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'a@b.edu', name: 'Ada', role: 'student', school_id: null },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => true,
    });

    render(<LandingPage />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /login when there is no session', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<LandingPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
