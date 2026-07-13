// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import Button from './Button';

describe('Button Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render correct children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('should trigger onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    
    const buttonElement = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(buttonElement);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Submit</Button>);
    
    const buttonElement = screen.getByRole('button', { name: 'Submit' });
    expect(buttonElement.getAttribute('disabled')).not.toBeNull();
    
    fireEvent.click(buttonElement);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should show loading spinner and be disabled when loading prop is true', () => {
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>Submit</Button>);
    
    const buttonElement = screen.getByRole('button', { name: 'Submit' });
    expect(buttonElement.getAttribute('disabled')).not.toBeNull();
    
    // Spinner SVG should be present
    const spinner = buttonElement.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner?.classList.contains('animate-spin')).toBe(true);

    fireEvent.click(buttonElement);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should render primary variant classes by default', () => {
    render(<Button>Button</Button>);
    const buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('bg-primary');
  });

  it('should render variant classes correctly', () => {
    const { rerender } = render(<Button variant="secondary">Button</Button>);
    let buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('bg-surface');

    rerender(<Button variant="danger">Button</Button>);
    buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('bg-danger');

    rerender(<Button variant="ghost">Button</Button>);
    buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('bg-transparent');
  });

  it('should render size classes correctly', () => {
    const { rerender } = render(<Button size="sm">Button</Button>);
    let buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('h-8');

    rerender(<Button size="md">Button</Button>);
    buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('h-10');

    rerender(<Button size="lg">Button</Button>);
    buttonElement = screen.getByRole('button', { name: 'Button' });
    expect(buttonElement.className).toContain('h-12');
  });
});
