'use client';

import React, { useEffect, useRef } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface ToastProps {
  message: ToastMessage | null;
  onClose: () => void;
}

const toastConfig = {
  success: {
    icon: '✓',
    color: 'bg-green-50 border-green-200 text-green-800 dark:bg-slate-900 dark:border-green-800 dark:text-green-200 border-l-green-500',
    progress: 'bg-green-500',
  },
  error: {
    icon: '✕',
    color: 'bg-red-50 border-red-200 text-red-800 dark:bg-slate-900 dark:border-red-800 dark:text-red-200 border-l-red-500',
    progress: 'bg-red-500',
  },
  info: {
    icon: 'ℹ',
    color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-slate-900 dark:border-blue-800 dark:text-blue-200 border-l-blue-500',
    progress: 'bg-blue-500',
  },
  warning: {
    icon: '⚠',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-slate-900 dark:border-yellow-800 dark:text-yellow-200 border-l-yellow-500',
    progress: 'bg-yellow-500',
  },
};

export function Toast({ message, onClose }: ToastProps) {
  // Callers pass an inline `onClose={() => setToast(null)}`, a new function
  // identity every render - keeping it out of the timer effect's deps (via
  // this ref) stops an unrelated parent re-render from resetting the
  // 4-second dismiss countdown, which could otherwise keep a toast on
  // screen indefinitely.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => onCloseRef.current(), 4000);
    return () => clearTimeout(timer);
    // Intentionally keyed on message?.id alone, not the whole `message`
    // object: the countdown should restart for a genuinely new toast, not
    // for an unrelated re-render that happens to produce an equal-but-new
    // message reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id]);

  if (!message) return null;

  const config = toastConfig[message.type];

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50
        flex items-center gap-3 px-4 py-3.5 rounded-lg border
        border-l-4 shadow-lg overflow-hidden
        animate-slideInRight
        transition-all duration-300
        ${config.color}
      `}
    >
      <span className="text-xl font-bold">{config.icon}</span>
      <p className="text-sm font-semibold pr-2">{message.text}</p>
      <button
        onClick={onClose}
        className="ml-auto text-lg opacity-60 hover:opacity-100 p-0.5 transition-opacity"
      >
        ✕
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-neutral-200/50 dark:bg-slate-800/60">
        <div
          className={`h-full ${config.progress} animate-shrink`}
          style={{
            animation: 'shrink 4s linear forwards',
          }}
        />
      </div>
    </div>
  );
}
export default Toast;
export type { ToastProps };
