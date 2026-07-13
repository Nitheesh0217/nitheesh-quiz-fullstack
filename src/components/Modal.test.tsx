// Tests for: src/components/Modal.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
});

describe('Modal', () => {
  it('renders nothing when closed and never opened', () => {
    const { container } = render(
      <Modal isOpen={false} title="Title" onClose={vi.fn()}>
        Body
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the title, description, and children when open', () => {
    render(
      <Modal isOpen title="My Modal" description="A helpful description" onClose={vi.fn()}>
        <p>Body content</p>
      </Modal>
    );
    expect(screen.getByText('My Modal')).toBeDefined();
    expect(screen.getByText('A helpful description')).toBeDefined();
    expect(screen.getByText('Body content')).toBeDefined();
  });

  it('omits the description paragraph when none is provided', () => {
    render(
      <Modal isOpen title="My Modal" onClose={vi.fn()}>
        Body
      </Modal>
    );
    expect(screen.queryByText('A helpful description')).toBeNull();
  });

  it('calls onClose when the backdrop or header X button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen title="My Modal" onClose={onClose}>
        Body
      </Modal>
    );

    const backdrop = container.querySelector('.fixed.inset-0.z-40')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stays rendered through the close transition and unmounts after transitionend while closed', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Modal isOpen title="My Modal" onClose={onClose}>
        Body
      </Modal>
    );

    rerender(
      <Modal isOpen={false} title="My Modal" onClose={onClose}>
        Body
      </Modal>
    );
    // Still rendered immediately after isOpen flips to false (mid-transition).
    expect(screen.getByText('My Modal')).toBeDefined();

    const backdrop = container.querySelector('.fixed.inset-0.z-40')!;
    fireEvent.transitionEnd(backdrop);
    expect(screen.queryByText('My Modal')).toBeNull();
  });

  it('renders custom footer content when provided, taking priority over the default submit footer', () => {
    render(
      <Modal isOpen title="t" onClose={vi.fn()} onSubmit={vi.fn()} footer={<button>Custom Footer Action</button>}>
        Body
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Custom Footer Action' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('renders no footer when neither footer nor onSubmit is provided', () => {
    render(
      <Modal isOpen title="t" onClose={vi.fn()}>
        Body
      </Modal>
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('renders the default Cancel/Create footer and calls onSubmit/onClose', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <Modal isOpen title="t" onClose={onClose} onSubmit={onSubmit}>
        Body
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the submitting state and disables the Create button', () => {
    render(
      <Modal isOpen title="t" onClose={vi.fn()} onSubmit={vi.fn()} isSubmitting>
        Body
      </Modal>
    );
    const button = screen.getByRole('button', { name: /Creating/ });
    expect(button.textContent).toContain('⏳ Creating...');
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('supports each size variant', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = render(
        <Modal isOpen title="t" onClose={vi.fn()} size={size}>
          Body
        </Modal>
      );
      unmount();
    }
  });
});
