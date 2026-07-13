// Tests for: src/app/dashboard/layout.tsx (user dropdown menu)
//
// Kept in its own file, separate from layout.test.tsx: opening the Radix
// dropdown menu here is the only place in the layout tests that mounts a
// Radix portal, and running it in the same jsdom `document` shared by the
// other ~11 layout tests (Vitest only resets the DOM between files, not
// between `it()` blocks) reliably crashed the whole worker process
// ("Worker exited unexpectedly") once several prior renders had already
// happened. Isolating it in its own file sidesteps whatever accumulated
// jsdom/Radix state was responsible, without weakening the coverage.
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import { useAuth } from '../../components/AuthProvider';

Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard/admin',
}));

vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const ADMIN_USER = { id: '1', name: 'Sarah Chen', email: 'sarah@school.edu', role: 'admin' as const, school_id: null };

describe('DashboardLayout user dropdown', () => {
  it('opens the user dropdown and signs out', async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout, hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    const user = userEvent.setup();
    await user.click(screen.getAllByText('Sarah Chen')[0].closest('button')!);
    await user.click(await screen.findByText('Sign Out'));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
