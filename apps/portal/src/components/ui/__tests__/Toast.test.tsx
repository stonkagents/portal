/**
 * Purpose: Tests for Toast component — individual toast rendering,
 *          variants, auto-dismiss, and action buttons.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Toast } from '../Toast';

const baseProps = {
  id: 'toast-1',
  title: 'Test toast',
  variant: 'info' as const,
  onDismiss: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders the title', () => {
    render(<Toast {...baseProps} />);
    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('renders a description when provided', () => {
    render(<Toast {...baseProps} description="Extra detail" />);
    expect(screen.getByText('Extra detail')).toBeInTheDocument();
  });

  it('has the correct data-testid', () => {
    render(<Toast {...baseProps} />);
    expect(screen.getByTestId('toast-toast-1')).toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<Toast {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('toast-dismiss-toast-1'));
    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('auto-dismisses after duration when autoDismiss is true', () => {
    const onDismiss = vi.fn();
    render(<Toast {...baseProps} onDismiss={onDismiss} autoDismiss duration={5000} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('does not auto-dismiss when autoDismiss is false', () => {
    const onDismiss = vi.fn();
    render(<Toast {...baseProps} onDismiss={onDismiss} autoDismiss={false} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('renders an action link that opens in a new tab when the action has an href', () => {
    render(<Toast {...baseProps} action={{ label: 'View tx ↗', href: 'https://solscan.io/tx/abc?cluster=devnet' }} />);
    const link = screen.getByTestId('toast-action-toast-1');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://solscan.io/tx/abc?cluster=devnet');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders an action button when action is provided', () => {
    const onClick = vi.fn();
    render(<Toast {...baseProps} action={{ label: 'View file', onClick }} />);
    const actionBtn = screen.getByTestId('toast-action-toast-1');
    expect(actionBtn).toBeInTheDocument();
    expect(actionBtn).toHaveTextContent('View file');
    fireEvent.click(actionBtn);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders with success variant styling', () => {
    render(<Toast {...baseProps} variant="success" />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('success');
  });

  it('renders with error variant styling', () => {
    render(<Toast {...baseProps} variant="error" />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('error');
  });

  it('renders with warning variant styling', () => {
    render(<Toast {...baseProps} variant="warning" />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('warning');
  });

  it('renders with info variant styling', () => {
    render(<Toast {...baseProps} variant="info" />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('info');
  });
});

describe('Toast — design system alignment (Section 24)', () => {
  it('renders check-circle icon for success variant', () => {
    render(<Toast {...baseProps} variant="success" />);
    const icon = screen.getByTestId('toast-icon-toast-1');
    expect(icon).toBeInTheDocument();
    const svgUse = icon.querySelector('use');
    expect(svgUse?.getAttribute('href')).toContain('check-circle');
  });

  it('renders alert-triangle icon for error variant', () => {
    render(<Toast {...baseProps} variant="error" />);
    const icon = screen.getByTestId('toast-icon-toast-1');
    const svgUse = icon.querySelector('use');
    expect(svgUse?.getAttribute('href')).toContain('alert-triangle');
  });

  it('renders info icon for info variant', () => {
    render(<Toast {...baseProps} variant="info" />);
    const icon = screen.getByTestId('toast-icon-toast-1');
    const svgUse = icon.querySelector('use');
    expect(svgUse?.getAttribute('href')).toContain('info');
  });

  it('renders alert-triangle icon for warning variant', () => {
    render(<Toast {...baseProps} variant="warning" />);
    const icon = screen.getByTestId('toast-icon-toast-1');
    const svgUse = icon.querySelector('use');
    expect(svgUse?.getAttribute('href')).toContain('alert-triangle');
  });

  it('has animate-fade-in-up class', () => {
    render(<Toast {...baseProps} />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('animate-fade-in-up');
  });

  it('has rounded-md border radius (not rounded-sm)', () => {
    render(<Toast {...baseProps} />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).toContain('rounded-md');
    expect(toast.className).not.toContain('rounded-sm');
  });

  it('does not have border-l-[3px] (uses 1px solid via inline style)', () => {
    render(<Toast {...baseProps} />);
    const toast = screen.getByTestId('toast-toast-1');
    expect(toast.className).not.toContain('border-l-');
  });
});
