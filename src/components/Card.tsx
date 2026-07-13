import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  hover?: boolean;
}

export function Card({
  variant = 'default',
  hover = true,
  children,
  className = '',
  ...props
}: CardProps) {
  const variantStyles = {
    default: `
      bg-white dark:bg-dark-surface
      rounded-xl shadow-sm
      border border-neutral-205 dark:border-dark-border
      ${hover ? 'hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/50' : ''}
    `,
    elevated: `
      bg-white dark:bg-dark-surface
      rounded-xl shadow-md
      border border-neutral-205 dark:border-dark-border
      ${hover ? 'hover:shadow-xl hover:translate-y-[-2px]' : ''}
    `,
    outlined: `
      bg-transparent
      rounded-xl border-2 border-neutral-300 dark:border-dark-border
      ${hover ? 'hover:border-blue-400 dark:hover:border-blue-500' : ''}
    `,
  };

  return (
    <div 
      className={`
        transition-all duration-300 ease-out
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
export default Card;
