// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import Toast, { type ToastMessage } from './Toast';

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should render nothing if message is null', () => {
    const { container } = render(<Toast message={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render success style and text correctly', () => {
    const message: ToastMessage = {
      id: 'test-1',
      type: 'success',
      text: 'Successfully completed task!',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    expect(screen.getByText('✓')).toBeDefined();
    expect(screen.getByText('Successfully completed task!')).toBeDefined();
  });

  it('should render error style and text correctly', () => {
    const message: ToastMessage = {
      id: 'test-2',
      type: 'error',
      text: 'An error occurred.',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    expect(screen.getAllByText('✕').length).toBe(2);
    expect(screen.getByText('An error occurred.')).toBeDefined();
  });

  it('should render info style and text correctly', () => {
    const message: ToastMessage = {
      id: 'test-3',
      type: 'info',
      text: 'Information update.',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    expect(screen.getByText('ℹ')).toBeDefined();
    expect(screen.getByText('Information update.')).toBeDefined();
  });

  it('should render warning style and text correctly', () => {
    const message: ToastMessage = {
      id: 'test-4',
      type: 'warning',
      text: 'Warning message.',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    expect(screen.getByText('⚠')).toBeDefined();
    expect(screen.getByText('Warning message.')).toBeDefined();
  });

  it('should call onClose when close button is clicked', () => {
    const message: ToastMessage = {
      id: 'test-5',
      type: 'info',
      text: 'Click me to close.',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose automatically after 4000ms timer expires', () => {
    const message: ToastMessage = {
      id: 'test-6',
      type: 'success',
      text: 'Dismiss automatically.',
    };
    const onClose = vi.fn();

    render(<Toast message={message} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should still auto-dismiss on schedule even if the parent re-renders with a new onClose identity', () => {
    // Regression test: callers pass an inline `onClose={() => setToast(null)}`,
    // a new function reference every render. The dismiss timer must not
    // reset just because the parent re-rendered for an unrelated reason.
    const message: ToastMessage = {
      id: 'test-7',
      type: 'info',
      text: 'Should not survive a parent re-render.',
    };
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();

    const { rerender } = render(<Toast message={message} onClose={onCloseA} />);

    vi.advanceTimersByTime(2000);
    rerender(<Toast message={message} onClose={onCloseB} />);
    vi.advanceTimersByTime(2000);

    expect(onCloseA).not.toHaveBeenCalled();
    expect(onCloseB).toHaveBeenCalledTimes(1);
  });
});
