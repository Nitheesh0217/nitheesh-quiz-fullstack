'use client';

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Volume2 } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

export interface AnnouncementValues {
  title: string;
  content: string;
}

interface AnnouncementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValues?: Partial<AnnouncementValues>;
  submitting?: boolean;
  onSubmit: (values: AnnouncementValues) => void;
}

const EMPTY_VALUES: AnnouncementValues = { title: '', content: '' };

export function AnnouncementForm({ open, onOpenChange, title, initialValues, submitting, onSubmit }: AnnouncementFormProps) {
  const [values, setValues] = useState<AnnouncementValues>({ ...EMPTY_VALUES, ...initialValues });

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY_VALUES, ...initialValues });
    }
    // Only re-sync when the modal opens, not on every initialValues re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">
          <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />

          <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                  <Volume2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">{title}</Dialog.Title>
                  <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Post an update for everyone in this class.</Dialog.Description>
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
          >
            <div className="px-6 py-5 space-y-4">
              <Input
                id="announcement-title"
                label="Title"
                required
                placeholder="e.g. Midterm exam schedule"
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              />

              <div className="space-y-1.5">
                <label htmlFor="announcement-content" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">Message</label>
                <textarea
                  id="announcement-content"
                  required
                  value={values.content}
                  onChange={(e) => setValues((v) => ({ ...v, content: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-32 leading-relaxed"
                  placeholder="Write your announcement..."
                />
              </div>
            </div>

            <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
              <Dialog.Close asChild>
                <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                  Cancel
                </button>
              </Dialog.Close>
              <Button type="submit" loading={submitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                Post Announcement
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AnnouncementForm;
