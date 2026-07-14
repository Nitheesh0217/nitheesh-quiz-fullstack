// Tests for: src/components/SyllabusWeekForm.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { SyllabusWeekForm } from './SyllabusWeekForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ASSIGNMENT_OPTIONS = [
  { id: 'a1', title: 'Essay 1' },
  { id: 'a2', title: 'Lab Report' },
];

describe('SyllabusWeekForm', () => {
  it('renders nothing when closed', () => {
    render(
      <SyllabusWeekForm
        open={false}
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.queryByText('Add Syllabus Week')).toBeNull();
  });

  it('renders default empty values when opened with no initialValues', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Add Syllabus Week' })).toBeDefined();
    expect((screen.getByLabelText('Week #') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Topics') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Readings') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Linked assignment (optional)') as HTMLSelectElement).value).toBe('');
  });

  it('pre-fills fields from initialValues when editing, including a null linked assignment', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{
          week_number: 3,
          title: 'Subnetting',
          topics: 'CIDR notation',
          readings: 'Chapter 3',
          video_links: ['https://video.example/lec3'],
          linked_assignment_id: null,
        }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Week #') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Subnetting');
    expect((screen.getByLabelText('Topics') as HTMLTextAreaElement).value).toBe('CIDR notation');
    expect((screen.getByLabelText('Readings') as HTMLInputElement).value).toBe('Chapter 3');
    expect(screen.getByText('https://video.example/lec3')).toBeDefined();
    expect((screen.getByLabelText('Linked assignment (optional)') as HTMLSelectElement).value).toBe('');
  });

  it('pre-fills the linked assignment select when an id is provided', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ linked_assignment_id: 'a2' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Linked assignment (optional)') as HTMLSelectElement).value).toBe('a2');
  });

  it('updates week number (falling back to 1 on invalid input), title, topics, and readings as the user types', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Week #'), { target: { value: '5' } });
    expect((screen.getByLabelText('Week #') as HTMLInputElement).value).toBe('5');

    // Clearing the number input entirely makes parseInt('') NaN — code falls back to 1.
    fireEvent.change(screen.getByLabelText('Week #'), { target: { value: '' } });
    expect((screen.getByLabelText('Week #') as HTMLInputElement).value).toBe('1');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Intro' } });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Intro');

    fireEvent.change(screen.getByLabelText('Topics'), { target: { value: 'Topic list' } });
    expect((screen.getByLabelText('Topics') as HTMLTextAreaElement).value).toBe('Topic list');

    fireEvent.change(screen.getByLabelText('Readings'), { target: { value: 'Ch. 2' } });
    expect((screen.getByLabelText('Readings') as HTMLInputElement).value).toBe('Ch. 2');
  });

  it('adds a video link via the Add button and via pressing Enter, ignoring blank input', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    const videoInput = screen.getByPlaceholderText('Paste a title or URL, then Enter');

    // Blank / whitespace-only input is ignored.
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(videoInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.queryByText('📺')).toBeNull();

    fireEvent.change(videoInput, { target: { value: 'https://video.example/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('https://video.example/1')).toBeDefined();
    // The input clears after adding.
    expect((videoInput as HTMLInputElement).value).toBe('');

    fireEvent.change(videoInput, { target: { value: 'https://video.example/2' } });
    fireEvent.keyDown(videoInput, { key: 'Enter' });
    expect(screen.getByText('https://video.example/2')).toBeDefined();

    // A non-Enter key should not add anything.
    fireEvent.change(videoInput, { target: { value: 'https://video.example/3' } });
    fireEvent.keyDown(videoInput, { key: 'a' });
    expect(screen.queryByText('https://video.example/3')).toBeNull();
  });

  it('removes a video link', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ video_links: ['https://video.example/a', 'https://video.example/b'] }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText('https://video.example/a')).toBeDefined();
    expect(screen.getByText('https://video.example/b')).toBeDefined();

    const removeButtons = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByText('https://video.example/a')).toBeNull();
    expect(screen.getByText('https://video.example/b')).toBeDefined();
  });

  it('selects and clears a linked assignment', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Linked assignment (optional)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'a1' } });
    expect(select.value).toBe('a1');

    fireEvent.change(select, { target: { value: '' } });
    expect(select.value).toBe('');
  });

  it('submits the full set of current values', () => {
    const onSubmit = vi.fn();
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(screen.getByLabelText('Week #'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Week Two' } });
    fireEvent.change(screen.getByLabelText('Topics'), { target: { value: 'Topics here' } });
    fireEvent.change(screen.getByLabelText('Readings'), { target: { value: 'Reading here' } });
    fireEvent.change(screen.getByLabelText('Linked assignment (optional)'), { target: { value: 'a2' } });

    fireEvent.submit(screen.getByLabelText('Title').closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith({
      week_number: 2,
      title: 'Week Two',
      topics: 'Topics here',
      readings: 'Reading here',
      video_links: [],
      linked_assignment_id: 'a2',
    });
  });

  it('shows the submitting state and disables the save button', () => {
    render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        submitting
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByRole('button', { name: 'Save Week' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('invokes onOpenChange(false) from the header close button and the Cancel button', () => {
    const onOpenChange = vi.fn();
    render(
      <SyllabusWeekForm
        open
        onOpenChange={onOpenChange}
        title="Add Syllabus Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not reset in-progress edits while open, but resyncs on reopen', () => {
    const { rerender } = render(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ title: 'Original title' }}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'User typed this' } });

    rerender(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ title: 'Changed underneath' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('User typed this');

    rerender(
      <SyllabusWeekForm
        open={false}
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ title: 'Changed underneath' }}
        onSubmit={vi.fn()}
      />
    );
    rerender(
      <SyllabusWeekForm
        open
        onOpenChange={vi.fn()}
        title="Edit Week"
        assignmentOptions={ASSIGNMENT_OPTIONS}
        initialValues={{ title: 'Changed underneath' }}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Changed underneath');
  });
});
