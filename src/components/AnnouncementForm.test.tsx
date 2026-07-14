// Tests for: src/components/AnnouncementForm.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AnnouncementForm } from './AnnouncementForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AnnouncementForm', () => {
  it('renders nothing when closed', () => {
    render(
      <AnnouncementForm open={false} onOpenChange={vi.fn()} title="Post Announcement" onSubmit={vi.fn()} />
    );
    expect(screen.queryByText('Post Announcement')).toBeNull();
  });

  it('renders empty fields by default when opened with no initialValues', () => {
    render(<AnnouncementForm open onOpenChange={vi.fn()} title="Post Announcement" onSubmit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Post Announcement' })).toBeDefined();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
  });

  it('pre-fills fields from initialValues when editing', () => {
    render(
      <AnnouncementForm
        open
        onOpenChange={vi.fn()}
        title="Edit Announcement"
        initialValues={{ title: 'Midterm schedule', content: 'Exam is next week.' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Midterm schedule');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Exam is next week.');
  });

  it('updates field values as the user types', () => {
    render(<AnnouncementForm open onOpenChange={vi.fn()} title="Post Announcement" onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'New content' } });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('New title');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('New content');
  });

  it('submits the current field values', () => {
    const onSubmit = vi.fn();
    render(<AnnouncementForm open onOpenChange={vi.fn()} title="Post Announcement" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'World' } });
    fireEvent.submit(screen.getByLabelText('Title').closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', content: 'World' });
  });

  it('shows the submitting state on the submit button', () => {
    render(
      <AnnouncementForm open onOpenChange={vi.fn()} title="Post Announcement" submitting onSubmit={vi.fn()} />
    );
    const button = screen.getByRole('button', { name: 'Post Announcement' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('invokes onOpenChange(false) when the header close (X) button is clicked', () => {
    const onOpenChange = vi.fn();
    render(<AnnouncementForm open onOpenChange={onOpenChange} title="Post Announcement" onSubmit={vi.fn()} />);
    // The header X and the footer Cancel button both close the dialog;
    // grab the header one specifically (an unnamed icon-only button).
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('invokes onOpenChange(false) when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<AnnouncementForm open onOpenChange={onOpenChange} title="Post Announcement" onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not reset already-edited values on a re-render while still open, but resets on reopen', () => {
    const { rerender } = render(
      <AnnouncementForm
        open
        onOpenChange={vi.fn()}
        title="Edit Announcement"
        initialValues={{ title: 'Original', content: 'Original body' }}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited by user' } });

    // Parent re-renders with new initialValues while `open` stays true — the
    // effect is keyed on `open` only, so the user's in-progress edit must survive.
    rerender(
      <AnnouncementForm
        open
        onOpenChange={vi.fn()}
        title="Edit Announcement"
        initialValues={{ title: 'Server value changed underneath', content: 'Original body' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Edited by user');

    // Closing and reopening (a fresh "open" transition) re-syncs from initialValues.
    rerender(
      <AnnouncementForm
        open={false}
        onOpenChange={vi.fn()}
        title="Edit Announcement"
        initialValues={{ title: 'Server value changed underneath', content: 'Original body' }}
        onSubmit={vi.fn()}
      />
    );
    rerender(
      <AnnouncementForm
        open
        onOpenChange={vi.fn()}
        title="Edit Announcement"
        initialValues={{ title: 'Server value changed underneath', content: 'Original body' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Server value changed underneath');
  });
});
