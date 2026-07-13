// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import Input from './Input';

describe('Input Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render input field with correct placeholder', () => {
    render(<Input placeholder="Enter username" id="username" />);
    const inputElement = screen.getByPlaceholderText('Enter username') as HTMLInputElement;
    expect(inputElement).toBeDefined();
    expect(inputElement.id).toBe('username');
  });

  it('should display label when provided', () => {
    render(<Input label="Username" id="user-input" />);
    expect(screen.getByText('Username')).toBeDefined();
  });

  it('should display error message and red asterisk next to label when error prop is present', () => {
    render(<Input label="Email" error="Invalid email address" id="email" />);
    expect(screen.getByText('Invalid email address')).toBeDefined();
    expect(screen.getByText('*')).toBeDefined();
    expect(screen.getByText('✕')).toBeDefined();
  });

  it('should display success checkmark when success prop is true and no error is present', () => {
    render(<Input label="Email" success id="email" />);
    expect(screen.getByText('✓')).toBeDefined();
  });

  it('should display hint message when hint prop is present and no error is present', () => {
    render(<Input label="Password" hint="Must be at least 8 characters" id="password" />);
    expect(screen.getByText('Must be at least 8 characters')).toBeDefined();
  });

  it('should hide hint and show error instead when both hint and error are provided', () => {
    render(<Input label="Password" hint="Must be at least 8 characters" error="Password is too weak" id="password" />);
    expect(screen.getByText('Password is too weak')).toBeDefined();
    expect(screen.queryByText('Must be at least 8 characters')).toBeNull();
  });

  it('should render icon inside input when icon is provided', () => {
    const testIcon = <span data-testid="test-icon">🔍</span>;
    render(<Input icon={testIcon} id="search" />);
    expect(screen.getByTestId('test-icon')).toBeDefined();
  });

  it('should trigger onChange callback when user types', () => {
    const handleChange = vi.fn();
    render(<Input placeholder="Type here" onChange={handleChange} id="type" />);
    
    const inputElement = screen.getByPlaceholderText('Type here') as HTMLInputElement;
    fireEvent.change(inputElement, { target: { value: 'Hello' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(inputElement.value).toBe('Hello');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Input placeholder="Locked" disabled id="locked" />);
    const inputElement = screen.getByPlaceholderText('Locked') as HTMLInputElement;
    expect(inputElement.disabled).toBe(true);
  });
});
