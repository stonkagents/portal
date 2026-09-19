/**
 * Purpose: Tests for ShareScanProgress — uniform 4-step pass/pending flow for all file types
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ShareScanProgress, SCAN_CHECKS } from '../ShareScanProgress';

describe('ShareScanProgress uniform flow', () => {
  it('renders all 4 scan checks', () => {
    render(<ShareScanProgress scanProgress={0} complete={false} />);
    const checks = screen.getAllByTestId(/^scan-check-/);
    expect(checks).toHaveLength(4);
  });

  it('shows all checks as pending when scanProgress is 0', () => {
    render(<ShareScanProgress scanProgress={0} complete={false} />);
    const pending = screen.getAllByTestId('scan-check-pending');
    expect(pending).toHaveLength(4);
  });

  it('marks checks as passed up to scanProgress', () => {
    render(<ShareScanProgress scanProgress={2} complete={false} />);
    const passed = screen.getAllByTestId('scan-check-passed');
    const pending = screen.getAllByTestId('scan-check-pending');
    expect(passed).toHaveLength(2);
    expect(pending).toHaveLength(2);
  });

  it('marks all checks as passed when scanProgress equals total', () => {
    render(<ShareScanProgress scanProgress={4} complete={true} />);
    const passed = screen.getAllByTestId('scan-check-passed');
    expect(passed).toHaveLength(4);
    expect(screen.queryByTestId('scan-check-pending')).not.toBeInTheDocument();
  });

  it('shows "Passed" badge when complete', () => {
    render(<ShareScanProgress scanProgress={4} complete={true} />);
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('shows "Scanning..." badge when not complete', () => {
    render(<ShareScanProgress scanProgress={1} complete={false} />);
    expect(screen.getByText('Scanning...')).toBeInTheDocument();
  });

  it('includes "File format validated" as check #3', () => {
    render(<ShareScanProgress scanProgress={4} complete={true} />);
    expect(SCAN_CHECKS[2]).toBe('File format validated');
    expect(screen.getByText('File format validated')).toBeInTheDocument();
  });

  it('has no skip state — only passed and pending exist', () => {
    render(<ShareScanProgress scanProgress={2} complete={false} />);
    expect(screen.queryByTestId('scan-check-skipped')).not.toBeInTheDocument();
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
  });
});
