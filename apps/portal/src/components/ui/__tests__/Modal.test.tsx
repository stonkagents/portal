/**
 * Purpose: Unit tests for Modal — open/close, Escape key, backdrop click, title rendering
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Modal } from '../Modal';

// jsdom doesn't support HTMLDialogElement.showModal/close — polyfill
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

describe('Modal', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <Modal open onClose={vi.fn()} title="Test Title">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders close button with aria-label when title is set', () => {
    render(
      <Modal open onClose={vi.fn()} title="Title">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Title">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on backdrop click (clicking dialog element directly)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByTestId('modal');
    // Simulate clicking the dialog backdrop (target === dialog element)
    fireEvent.click(dialog, { target: dialog });
    expect(onClose).toHaveBeenCalled();
  });

  it('has data-testid="modal"', () => {
    render(
      <Modal open onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
