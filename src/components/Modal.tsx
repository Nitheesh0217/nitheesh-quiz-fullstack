'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export function Modal({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  onSubmit,
  isSubmitting,
}: ModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  const handleTransitionEnd = () => {
    if (!isOpen) setShouldRender(false);
  };

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40 bg-black/40 backdrop-blur-sm
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        onTransitionEnd={handleTransitionEnd}
      />

      {/* Modal Container */}
      <div
        className={`
          fixed inset-0 z-50 flex items-center justify-center px-4
          transition-all duration-300
          ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
        `}
      >
        <div
          className={`
            bg-surface dark:bg-dark-surface
            rounded-2xl shadow-xl border border-border dark:border-dark-border
            w-full ${sizeStyles[size]}
            flex flex-col
            max-h-[90vh] overflow-hidden
          `}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-border dark:border-dark-border bg-surface dark:bg-dark-surface z-10">
            <div>
              <h2 className="text-base font-extrabold text-text-primary tracking-tight">
                {title}
              </h2>
              {description && (
                <p className="text-xs text-text-secondary mt-1 font-medium leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg border border-border dark:border-dark-border focus:outline-none cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 p-6 overflow-y-auto bg-surface dark:bg-dark-surface">
            {children}
          </div>

          {/* Footer */}
          {footer ? (
            <div className="p-5 border-t border-border dark:border-dark-border bg-neutral-50/50 dark:bg-dark-bg/40 flex justify-end">
              {footer}
            </div>
          ) : onSubmit ? (
            <div className="p-5 border-t border-border dark:border-dark-border bg-neutral-50/50 dark:bg-dark-bg/40 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-xs font-bold border border-border dark:border-dark-border rounded-lg bg-transparent hover:bg-background text-text-secondary transition-all active:scale-[0.98] focus:outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 text-xs font-bold bg-primary hover:bg-primary-hover text-white rounded-lg disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm focus:outline-none cursor-pointer"
              >
                {isSubmitting ? '⏳ Creating...' : 'Create'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default Modal;
