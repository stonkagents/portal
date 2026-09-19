/**
 * Purpose: Tests for HeroDaemonReconnecting — auto-reconnect hero component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HeroDaemonReconnecting } from '../HeroDaemonReconnecting';

describe('HeroDaemonReconnecting', () => {
  const defaultProps = {
    attempt: 2,
    maxAttempts: 5,
    onCancel: vi.fn(),
  };

  it('renders the reconnecting heading', () => {
    render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  it('displays the attempt counter', () => {
    render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/of 5/)).toBeInTheDocument();
  });

  it('updates attempt counter when props change', () => {
    const { rerender } = render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();

    rerender(<HeroDaemonReconnecting {...defaultProps} attempt={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders the cancel button', () => {
    render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByTestId('cancel-reconnect-button')).toBeInTheDocument();
  });

  it('fires onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<HeroDaemonReconnecting {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('cancel-reconnect-button'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows data safety reassurance', () => {
    render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByText('Your data is safe')).toBeInTheDocument();
  });

  it('has correct test id on root element', () => {
    render(<HeroDaemonReconnecting {...defaultProps} />);
    expect(screen.getByTestId('hero-daemon-reconnecting')).toBeInTheDocument();
  });
});
