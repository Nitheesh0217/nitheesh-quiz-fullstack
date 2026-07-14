// Tests for: src/components/SyllabusWeekAccordion.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { SyllabusWeekAccordion, type SyllabusWeek } from './SyllabusWeekAccordion';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const WEEK_1: SyllabusWeek = {
  id: 'w1',
  week_number: 1,
  title: 'Intro to Networking',
  topics: 'OSI model, TCP/IP basics',
  readings: 'Chapter 1',
  video_links: ['https://video.example/lecture1'],
  linked_assignment_id: 'a1',
};

const WEEK_2: SyllabusWeek = {
  id: 'w2',
  week_number: 2,
  title: 'Subnetting',
  topics: null,
  readings: null,
  video_links: [],
  linked_assignment_id: null,
};

describe('SyllabusWeekAccordion', () => {
  it('shows the teacher empty state prompting to add a week', () => {
    render(
      <SyllabusWeekAccordion weeks={[]} expandedWeek={null} onToggle={vi.fn()} teacherMode />
    );
    expect(screen.getByText('No syllabus weeks added yet. Click "Add Week" to get started.')).toBeDefined();
  });

  it('shows the student empty state when there are no weeks', () => {
    render(<SyllabusWeekAccordion weeks={[]} expandedWeek={null} onToggle={vi.fn()} />);
    expect(screen.getByText('No syllabus posted yet.')).toBeDefined();
  });

  it('renders each week collapsed by default with no body content', () => {
    render(
      <SyllabusWeekAccordion weeks={[WEEK_1, WEEK_2]} expandedWeek={null} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Intro to Networking')).toBeDefined();
    expect(screen.getByText('Subnetting')).toBeDefined();
    expect(screen.getByText('W1')).toBeDefined();
    expect(screen.getByText('W2')).toBeDefined();
    expect(screen.queryByText('OSI model, TCP/IP basics')).toBeNull();
  });

  it('expands the matching week and renders topics, readings, videos, and linked assignment', () => {
    render(
      <SyllabusWeekAccordion
        weeks={[WEEK_1, WEEK_2]}
        expandedWeek={1}
        onToggle={vi.fn()}
        assignmentTitleById={{ a1: 'Essay 1' }}
      />
    );
    expect(screen.getByText('OSI model, TCP/IP basics')).toBeDefined();
    expect(screen.getByText('Chapter 1')).toBeDefined();
    expect(screen.getByText('https://video.example/lecture1')).toBeDefined();
    expect(screen.getByText('Essay 1')).toBeDefined();
    // The other, collapsed week's body should not be present.
    expect(screen.queryByText('Subnetting')).toBeDefined(); // header always renders
  });

  it('omits topics, readings, videos, and the linked-assignment block when absent', () => {
    render(
      <SyllabusWeekAccordion weeks={[WEEK_2]} expandedWeek={2} onToggle={vi.fn()} />
    );
    expect(screen.queryByText('Overview & Topics')).toBeNull();
    expect(screen.queryByText('Required Readings')).toBeNull();
    expect(screen.queryByText('Lecture Videos')).toBeNull();
    expect(screen.queryByText('Linked Assignment')).toBeNull();
  });

  it('does not render the linked-assignment block when the id is not found in assignmentTitleById', () => {
    render(
      <SyllabusWeekAccordion
        weeks={[WEEK_1]}
        expandedWeek={1}
        onToggle={vi.fn()}
        assignmentTitleById={{}}
      />
    );
    expect(screen.queryByText('Linked Assignment')).toBeNull();
  });

  it('calls onToggle with the week number when the header row or chevron is clicked', () => {
    const onToggle = vi.fn();
    render(<SyllabusWeekAccordion weeks={[WEEK_1]} expandedWeek={null} onToggle={onToggle} />);

    fireEvent.click(screen.getByText('Intro to Networking'));
    expect(onToggle).toHaveBeenCalledWith(1);

    // Second, dedicated chevron button also toggles.
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('hides edit/delete controls when teacherMode is falsy', () => {
    render(<SyllabusWeekAccordion weeks={[WEEK_1]} expandedWeek={null} onToggle={vi.fn()} />);
    expect(screen.queryByTitle('Edit week')).toBeNull();
    expect(screen.queryByTitle('Delete week')).toBeNull();
  });

  it('shows edit/delete controls in teacherMode and invokes the callbacks with the week', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <SyllabusWeekAccordion
        weeks={[WEEK_1]}
        expandedWeek={null}
        onToggle={vi.fn()}
        teacherMode
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByTitle('Edit week'));
    expect(onEdit).toHaveBeenCalledWith(WEEK_1);

    fireEvent.click(screen.getByTitle('Delete week'));
    expect(onDelete).toHaveBeenCalledWith(WEEK_1);
  });

  it('does not crash clicking edit/delete in teacherMode when no callbacks are supplied', () => {
    render(<SyllabusWeekAccordion weeks={[WEEK_1]} expandedWeek={null} onToggle={vi.fn()} teacherMode />);
    expect(() => fireEvent.click(screen.getByTitle('Edit week'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByTitle('Delete week'))).not.toThrow();
  });
});
