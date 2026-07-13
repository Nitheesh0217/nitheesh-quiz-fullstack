'use client';

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

export interface SyllabusWeekValues {
  week_number: number;
  title: string;
  topics: string;
  readings: string;
  video_links: string[];
  linked_assignment_id: string | null;
}

interface SyllabusWeekFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValues?: Partial<SyllabusWeekValues>;
  assignmentOptions: Array<{ id: string; title: string }>;
  submitting?: boolean;
  onSubmit: (values: SyllabusWeekValues) => void;
}

const EMPTY_VALUES: SyllabusWeekValues = {
  week_number: 1,
  title: '',
  topics: '',
  readings: '',
  video_links: [],
  linked_assignment_id: null,
};

export function SyllabusWeekForm({
  open,
  onOpenChange,
  title,
  initialValues,
  assignmentOptions,
  submitting,
  onSubmit,
}: SyllabusWeekFormProps) {
  const [values, setValues] = useState<SyllabusWeekValues>({ ...EMPTY_VALUES, ...initialValues });
  const [videoInput, setVideoInput] = useState('');

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY_VALUES, ...initialValues });
      setVideoInput('');
    }
    // Only re-sync when the modal opens, not on every initialValues re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addVideoLink = () => {
    if (!videoInput.trim()) return;
    setValues((v) => ({ ...v, video_links: [...v.video_links, videoInput.trim()] }));
    setVideoInput('');
  };

  const removeVideoLink = (idx: number) => {
    setValues((v) => ({ ...v, video_links: v.video_links.filter((_, i) => i !== idx) }));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none max-h-[92vh] overflow-hidden flex flex-col border border-border/60 dark:border-dark-border/60">
          <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10 shrink-0" />

          <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50 shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                  <BookOpen className="h-5 w-5 text-white" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">{title}</Dialog.Title>
                  <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Add or update this week&rsquo;s curriculum.</Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(values);
            }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-3">
                <Input
                  id="week-number"
                  label="Week #"
                  type="number"
                  min={1}
                  required
                  value={values.week_number}
                  onChange={(e) => setValues((v) => ({ ...v, week_number: parseInt(e.target.value) || 1 }))}
                  className="col-span-1"
                />
                <Input
                  id="week-title"
                  label="Title"
                  required
                  placeholder="e.g. Introduction to Networking"
                  value={values.title}
                  onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                  className="col-span-2"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="week-topics" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">Topics</label>
                <textarea
                  id="week-topics"
                  value={values.topics}
                  onChange={(e) => setValues((v) => ({ ...v, topics: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-20 leading-relaxed"
                  placeholder="What this week covers..."
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="week-readings" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">Readings</label>
                <Input
                  id="week-readings"
                  placeholder="e.g. Chapter 3, sections 1-4"
                  value={values.readings}
                  onChange={(e) => setValues((v) => ({ ...v, readings: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="week-video-input" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">Video links</label>
                <div className="flex gap-2">
                  <input
                    id="week-video-input"
                    value={videoInput}
                    onChange={(e) => setVideoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addVideoLink();
                      }
                    }}
                    placeholder="Paste a title or URL, then Enter"
                    className="flex-1 h-10 px-3 rounded-lg border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-xs text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={addVideoLink}
                    className="h-10 px-3 rounded-lg border border-border dark:border-dark-border text-xs font-bold text-text-secondary hover:bg-background dark:hover:bg-dark-bg transition-colors"
                  >
                    Add
                  </button>
                </div>
                {values.video_links.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {values.video_links.map((link, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-background dark:bg-dark-bg border border-border/60 rounded-lg text-xs">
                        <span className="truncate text-text-primary">{link}</span>
                        <button
                          type="button"
                          onClick={() => removeVideoLink(idx)}
                          className="text-text-tertiary hover:text-danger shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="week-linked-assignment" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">Linked assignment (optional)</label>
                <select
                  id="week-linked-assignment"
                  value={values.linked_assignment_id ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, linked_assignment_id: e.target.value || null }))}
                  className="w-full h-10 px-3 rounded-lg border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-xs text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">None</option>
                  {assignmentOptions.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50 shrink-0">
              <Dialog.Close asChild>
                <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                  Cancel
                </button>
              </Dialog.Close>
              <Button type="submit" loading={submitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                Save Week
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default SyllabusWeekForm;
