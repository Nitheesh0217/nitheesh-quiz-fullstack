import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = 'default',
  size = 'sm',
  children,
  icon,
  className = '',
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-neutral-100 dark:bg-dark-border text-neutral-900 dark:text-neutral-50',
    success: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/30',
    warning: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900/30',
    danger: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/30',
    info: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
    md: 'px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider',
    lg: 'px-4 py-2 text-sm font-bold uppercase tracking-wider',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        rounded-full
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        transition-all duration-200
        hover:shadow-sm
        ${className}
      `}
    >
      {icon}
      {children}
    </span>
  );
}
export default Badge;
