'use client';

import React from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Card } from './Card';

export interface SyllabusWeek {
  id: string;
  week_number: number;
  title: string;
  topics: string | null;
  readings: string | null;
  video_links: string[];
  linked_assignment_id: string | null;
}

interface SyllabusWeekAccordionProps {
  weeks: SyllabusWeek[];
  expandedWeek: number | null;
  onToggle: (weekNumber: number) => void;
  assignmentTitleById?: Record<string, string>;
  teacherMode?: boolean;
  onEdit?: (week: SyllabusWeek) => void;
  onDelete?: (week: SyllabusWeek) => void;
}

export function SyllabusWeekAccordion({
  weeks,
  expandedWeek,
  onToggle,
  assignmentTitleById,
  teacherMode,
  onEdit,
  onDelete,
}: SyllabusWeekAccordionProps) {
  if (weeks.length === 0) {
    return (
      <Card hover={false} className="p-8 text-center border border-border bg-surface dark:bg-dark-surface">
        <p className="text-xs text-text-secondary font-medium">
          {teacherMode ? 'No syllabus weeks added yet. Click "Add Week" to get started.' : 'No syllabus posted yet.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const isOpen = expandedWeek === week.week_number;
        return (
          <Card
            key={week.id}
            hover={false}
            className={`border border-border dark:border-dark-border bg-surface dark:bg-dark-surface shadow-sm overflow-hidden transition-all duration-200 ${
              isOpen ? 'ring-1 ring-primary/10' : ''
            }`}
          >
            <div className="w-full flex items-center justify-between p-4">
              <button
                onClick={() => onToggle(week.week_number)}
                className="flex-1 flex items-center gap-3 text-left font-bold text-xs focus:outline-none cursor-pointer"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-soft text-primary text-[10px] font-black font-mono shrink-0">
                  W{week.week_number}
                </span>
                <span className="text-text-primary truncate">{week.title}</span>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {teacherMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit?.(week)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary-soft transition-colors"
                      title="Edit week"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(week)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                      title="Delete week"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button onClick={() => onToggle(week.week_number)} className="focus:outline-none cursor-pointer">
                  <ChevronRight
                    className={`h-4.5 w-4.5 text-text-tertiary transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-90 text-primary' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="p-5 border-t border-border dark:border-dark-border space-y-4 text-xs animate-slideDown">
                {week.topics && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Overview & Topics</span>
                    <p className="text-text-primary leading-relaxed font-medium">{week.topics}</p>
                  </div>
                )}

                {week.readings && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Required Readings</span>
                    <p className="text-text-primary leading-relaxed font-medium font-serif italic">{week.readings}</p>
                  </div>
                )}

                {week.video_links.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Lecture Videos</span>
                    <div className="space-y-1">
                      {week.video_links.map((vid, vIdx) => (
                        <div key={vIdx} className="flex items-center gap-2 text-text-primary font-medium">
                          <span className="text-primary">📺</span>
                          <span>{vid}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {week.linked_assignment_id && assignmentTitleById?.[week.linked_assignment_id] && (
                  <div className="pt-3 border-t border-border dark:border-dark-border space-y-1.5">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Linked Assignment</span>
                    <div className="p-2.5 bg-background dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg flex items-center gap-2">
                      <span className="text-sm">📁</span>
                      <span className="font-semibold text-text-primary">{assignmentTitleById[week.linked_assignment_id]}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default SyllabusWeekAccordion;
