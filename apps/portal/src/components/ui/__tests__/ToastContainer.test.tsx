/**
 * Purpose: Tests for ToastContainer — renders toasts from provider,
 *          fixed-position bottom-right, dismisses on click.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastContainer } from '../ToastContainer';
import type { ToastVariant } from '../Toast';
import { ToastProvider, useToast } from '../../../providers/ToastProvider';

/** Helper that triggers addToast inside the provider tree */
function AddToastButton({ variant = 'info', title = 'Test toast' }: { variant?: ToastVariant; title?: string }) {
  const { addToast } = useToast();
  return <button data-testid="trigger-toast" onClick={() => addToast({ title, variant, autoDismiss: false })} />;
}

function renderWithProvider(ui?: React.ReactNode) {
  return render(
    <ToastProvider>
      {ui}
      <ToastContainer />
    </ToastProvider>,
  );
}

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = renderWithProvider();
    expect(container.querySelector('[data-testid="toast-container"]')).toBeNull();
  });

  it('renders toasts when they exist', () => {
    renderWithProvider(<AddToastButton />);
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('has fixed position, bottom-right, z-[1000], and max-w-[400px]', () => {
    renderWithProvider(<AddToastButton />);
    fireEvent.click(screen.getByTestId('trigger-toast'));
    const container = screen.getByTestId('toast-container');
    expect(container.className).toContain('fixed');
    expect(container.className).toContain('bottom-4');
    expect(container.className).toContain('right-4');
    expect(container.className).toContain('z-[1000]');
    expect(container.className).toContain('max-w-[400px]');
  });

  it('has aria-live="polite" for accessibility', () => {
    renderWithProvider(<AddToastButton />);
    fireEvent.click(screen.getByTestId('trigger-toast'));
    const container = screen.getByTestId('toast-container');
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('dismisses a toast when its close button is clicked', () => {
    renderWithProvider(<AddToastButton />);
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Test toast')).toBeNull();
  });

  it('renders multiple toasts in a flex column', () => {
    renderWithProvider(
      <>
        <AddToastButton title="Toast A" />
        <AddToastButton title="Toast B" variant="error" />
      </>,
    );
    fireEvent.click(screen.getAllByTestId('trigger-toast')[0]);
    fireEvent.click(screen.getAllByTestId('trigger-toast')[1]);
    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(screen.getByText('Toast B')).toBeInTheDocument();
    const container = screen.getByTestId('toast-container');
    expect(container.className).toContain('flex');
    expect(container.className).toContain('flex-col');
    expect(container.className).toContain('gap-2');
  });
});
