/**
 * Purpose: Unit tests for Input — label, icon, controlled value, disabled state, error display
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Input } from '../Input';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders without label', () => {
    render(<Input placeholder="type here" />);
    expect(screen.getByPlaceholderText('type here')).toBeInTheDocument();
  });

  it('forwards controlled value', () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} />);
    const input = screen.getByTestId('input');
    expect(input).toHaveValue('hello');
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'new' } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('renders disabled state', () => {
    render(<Input disabled />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('displays error message', () => {
    render(<Input error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('applies error border class when error is set', () => {
    render(<Input error="Bad input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('border-accent-red');
  });

  it('generates id from label', () => {
    render(<Input label="First Name" />);
    const input = screen.getByTestId('input');
    expect(input.id).toBe('first-name');
  });

  it('has data-testid="input"', () => {
    render(<Input />);
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });
});
