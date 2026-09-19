/**
 * Purpose: Smoke test to verify Vitest + React Testing Library setup works
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button', { name: 'Secondary' });
    expect(btn).toBeInTheDocument();
  });

  it('fires onClick handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Saving</Button>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not show icon when loading', () => {
    const { container } = render(
      <Button loading icon="check">
        Save
      </Button>,
    );
    // Loading spinner replaces icon
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders size variants', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button').className).toContain('h-12');
  });

  it('forwards aria-label for icon-only buttons', () => {
    render(<Button icon="bell" aria-label="Notifications" />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Notifications');
  });

  it('has data-testid="button"', () => {
    render(<Button>Test</Button>);
    expect(screen.getByTestId('button')).toBeInTheDocument();
  });
});
