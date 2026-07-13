import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  success?: boolean;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  success,
  placeholder,
  type = 'text',
  disabled,
  icon,
  className = '',
  id,
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={id}
          className="block text-[10px] font-bold text-text-secondary mb-2 uppercase tracking-wider"
        >
          {label}
          {error && <span className="text-danger ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {icon}
          </div>
        )}

        <input
          id={id}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-4 py-2.5 rounded-lg
            border transition-all duration-200
            text-text-primary bg-surface dark:bg-dark-surface
            placeholder:text-text-tertiary text-xs
            
            ${icon ? 'pl-10' : 'pl-4'}
            
            ${
              error
                ? 'border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                : success
                ? 'border-emerald-500 dark:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                : 'border-border dark:border-dark-border focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
            }
            
            disabled:bg-background/50 dark:disabled:bg-dark-border disabled:text-text-tertiary disabled:cursor-not-allowed
            
            hover:border-border-strong dark:hover:border-dark-border/80
            focus:outline-none
            ${className}
          `}
          {...props}
        />

        {success && !error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-success animate-fadeIn text-xs">
            ✓
          </div>
        )}

        {error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-danger text-xs">
            ✕
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-danger flex items-center gap-1 font-semibold">
          <span>⚠️</span> {error}
        </p>
      )}

      {hint && !error && (
        <p className="mt-1.5 text-xs text-text-tertiary">
          {hint}
        </p>
      )}
    </div>
  );
}
export default Input;
