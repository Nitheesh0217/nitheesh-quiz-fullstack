import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-semibold rounded-lg
    transition-all duration-200 ease-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
    active:scale-[0.98]
    relative overflow-hidden
  `;

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs h-8',
    md: 'px-4 py-2.5 text-sm h-10',
    lg: 'px-6 py-3 text-base h-12',
  };

  const variantStyles = {
    primary: `
      bg-primary hover:bg-primary-hover text-white shadow-sm hover:shadow-lg
      focus:ring-primary focus:ring-offset-2
      active:shadow-inner
    `,
    secondary: `
      bg-surface text-text-primary border border-border-strong
      hover:bg-primary-soft hover:shadow-md
      focus:ring-primary
    `,
    danger: `
      bg-danger hover:opacity-90 text-white shadow-sm hover:shadow-lg
      focus:ring-danger
    `,
    ghost: `
      bg-transparent text-primary hover:bg-primary-soft
      border border-transparent hover:border-primary/20
      focus:ring-primary
    `,
  };

  return (
    <button
      disabled={disabled || loading}
      className={`
        ${baseStyles}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
export default Button;
