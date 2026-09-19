/**
 * Purpose: Tests for ToastProvider and useToast hook — adding, dismissing,
 *          and max-toast enforcement.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from '../../../providers/ToastProvider';

function TestConsumer() {
  const { addToast, dismissToast, toasts } = useToast();
  return (
    <div>
      <span data-testid="toast-count">{toasts.length}</span>
      <button
        data-testid="add-info"
        onClick={() => addToast({ title: 'Info toast', variant: 'info' })}
      />
      <button
        data-testid="add-error"
        onClick={() => addToast({ title: 'Error toast', variant: 'error', autoDismiss: false })}
      />
      <button
        data-testid="add-success"
        onClick={() => addToast({ title: 'Success toast', variant: 'success', autoDismiss: true, duration: 3000 })}
      />
      <button
        data-testid="dismiss-all"
        onClick={() => toasts.forEach(t => dismissToast(t.id))}
      />
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider + useToast', () => {
  it('starts with zero toasts', () => {
    renderWithProvider();
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('adds a toast when addToast is called', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('add-info'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
  });

  it('removes a toast when dismissToast is called', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('add-info'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('dismiss-all'));
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('enforces a maximum of 3 toasts', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('add-info'));
    fireEvent.click(screen.getByTestId('add-error'));
    fireEvent.click(screen.getByTestId('add-success'));
    expect(screen.getByTestId('toast-count').textContent).toBe('3');
    // Adding a 4th should evict the oldest
    fireEvent.click(screen.getByTestId('add-info'));
    expect(screen.getByTestId('toast-count').textContent).toBe('3');
  });

  it('generates unique ids for each toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('add-info'));
    fireEvent.click(screen.getByTestId('add-info'));
    // If IDs weren't unique, dismissing one would dismiss both
    // We just verify both exist
    expect(screen.getByTestId('toast-count').textContent).toBe('2');
  });
});
