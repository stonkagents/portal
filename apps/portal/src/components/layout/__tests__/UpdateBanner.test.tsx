/**
 * Purpose: Tests for UpdateBanner — "Update your agent" wording across AVAILABLE, DOWNLOADING, CANCELLED states
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { UpdateBanner, releaseOneLiner } from '../UpdateBanner';
import type { UpdateStatus } from '@/lib/api/hooks/use-update-status';

function makeStatus(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state: 'IDLE',
    currentVersion: '0.2.0',
    latestVersion: '0.2.0',
    releaseNotes: '',
    force: false,
    progress: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    error: null,
    installerUrl: null,
    manualInstall: false,
    ...overrides,
  };
}

describe('UpdateBanner', () => {
  it('renders nothing when state is IDLE', () => {
    const { container } = render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'IDLE' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );
    expect(container.innerHTML).toBe('');
  });

  it('AVAILABLE: shows one line from the release notes next to the title, no paragraph', () => {
    const notes = 'StonkAgents 2.4.1 (staging): the setup window now shows what the command tools step is doing under the progress bar, with elapsed time. Includes everything in 2.4.0: the community board update.';
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'AVAILABLE', latestVersion: '2.4.1', releaseNotes: notes, manualInstall: true, installerUrl: 'https://releases.example/x.exe' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );
    expect(screen.getByTestId('update-release-notes')).toHaveTextContent('The setup window now shows what the command tools step is doing under the progress bar,...');
    expect(screen.queryByText(/Includes everything/)).toBeNull();
    expect(screen.getByTestId('update-download-link')).toHaveTextContent('Download');
    expect(screen.getByTestId('update-download-link').className).toContain('bg-accent-green');
  });

  it('releaseOneLiner drops the lead-in and stops at the first sentence', () => {
    expect(releaseOneLiner('StonkAgents 2.4.2: fixes the setup hanging on the command tools step; onboarding now runs with a time limit.')).toBe('Fixes the setup hanging on the command tools step');
    expect(releaseOneLiner('Bug fixes')).toBe('Bug fixes');
    expect(releaseOneLiner('')).toBe('');
  });

  it('AVAILABLE: says "Update your agent" with the version, plus Later', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'AVAILABLE',
          latestVersion: '0.3.0',
          releaseNotes: 'Bug fixes',
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    expect(screen.getByText('Update your agent to v0.3.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update your agent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
    expect(screen.queryByText(/daemon/i)).not.toBeInTheDocument();
  });

  it('AVAILABLE manual install (Windows): offers the installer download instead of Update Now', () => {
    const onStartUpdate = vi.fn();
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'AVAILABLE',
          latestVersion: '2.1.4',
          manualInstall: true,
          installerUrl: 'https://releases.dev.stonkagents.com/2.1.4/StonkAgents-Setup-2.1.4.exe',
        }),
        onStartUpdate,
        onCancelUpdate: vi.fn(),
      }),
    );

    const link = screen.getByTestId('update-download-link');
    expect(link).toHaveAttribute('href', 'https://releases.dev.stonkagents.com/2.1.4/StonkAgents-Setup-2.1.4.exe');
    expect(link).toHaveTextContent(/^download$/i);
    expect(screen.queryByTestId('update-start-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('update-manual-hint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
    expect(onStartUpdate).not.toHaveBeenCalled();
  });

  it('AVAILABLE manual install without a known installer URL falls back to the update button', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'AVAILABLE', latestVersion: '2.1.4', manualInstall: true, installerUrl: null }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );
    expect(screen.getByTestId('update-start-button')).toBeInTheDocument();
    expect(screen.queryByTestId('update-download-link')).not.toBeInTheDocument();
  });

  it('AVAILABLE force: hides Later button, names the unsupported agent version', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'AVAILABLE',
          latestVersion: '0.3.0',
          force: true,
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText('Your agent v0.2.0 is no longer supported. Update to v0.3.0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update your agent/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /later/i })).not.toBeInTheDocument();
  });

  it('the update button calls onStartUpdate', () => {
    const onStart = vi.fn();
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'AVAILABLE', latestVersion: '0.3.0' }),
        onStartUpdate: onStart,
        onCancelUpdate: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /update your agent/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('DOWNLOADING: shows progress bar + percentage + Cancel', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'DOWNLOADING', progress: 45 }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByTestId('update-progress-bar')).toBeInTheDocument();
    expect(screen.getByText(/45%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('DOWNLOADING: shows byte count when bytesTotal > 0', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'DOWNLOADING',
          progress: 25,
          bytesDownloaded: 5 * 1024 * 1024,
          bytesTotal: 20 * 1024 * 1024,
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    // Should show human-readable byte counts (e.g. "5.0 MB / 20.0 MB")
    expect(screen.getByText(/5\.0\s*MB/)).toBeInTheDocument();
    expect(screen.getByText(/20\.0\s*MB/)).toBeInTheDocument();
  });

  it('DOWNLOADING: shows only percentage when bytesTotal is 0', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'DOWNLOADING',
          progress: 45,
          bytesDownloaded: 0,
          bytesTotal: 0,
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/45%/)).toBeInTheDocument();
    // Should NOT show "MB" when bytes are unknown
    expect(screen.queryByText(/MB/)).not.toBeInTheDocument();
  });

  it('Cancel click calls onCancelUpdate', () => {
    const onCancel = vi.fn();
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'DOWNLOADING', progress: 30 }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: onCancel,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('CANCELLED: renders nothing (toast handled externally)', () => {
    const { container } = render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'CANCELLED' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );
    expect(container.innerHTML).toBe('');
  });

  it('VERIFYING: shows spinner and text, no cancel button', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'VERIFYING' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/verifying update/i)).toBeInTheDocument();
    expect(screen.getByTestId('update-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('INSTALLING: shows spinner and text, no cancel button', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'INSTALLING' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/installing/i)).toBeInTheDocument();
    expect(screen.getByTestId('update-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('RESTARTING: shows spinner and text, no cancel button', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'RESTARTING' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/restarting your agent/i)).toBeInTheDocument();
    expect(screen.queryByText(/daemon/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('update-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('COMPLETE: shows success message with version', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'COMPLETE', latestVersion: '0.3.0' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/your agent is now v0\.3\.0/i)).toBeInTheDocument();
  });

  it('FAILED: shows error message and Dismiss button', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'FAILED',
          error: 'codesign check failed',
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText(/update failed\. your agent was rolled back/i)).toBeInTheDocument();
    expect(screen.getByText(/codesign check failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('AVAILABLE: shows release notes when non-empty', () => {
    render(
      createElement(UpdateBanner, {
        status: makeStatus({
          state: 'AVAILABLE',
          latestVersion: '0.3.0',
          releaseNotes: 'Bug fixes and performance improvements',
        }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
      }),
    );

    expect(screen.getByText('Bug fixes and performance improvements')).toBeInTheDocument();
  });

  it('VERIFYING/INSTALLING/RESTARTING: show "Do not close StonkAgents" warning', () => {
    for (const state of ['VERIFYING', 'INSTALLING', 'RESTARTING'] as const) {
      const { unmount } = render(
        createElement(UpdateBanner, {
          status: makeStatus({ state }),
          onStartUpdate: vi.fn(),
          onCancelUpdate: vi.fn(),
        }),
      );

      expect(screen.getByText(/do not close stonkagents/i)).toBeInTheDocument();
      unmount();
    }
  });

  it('FAILED: Dismiss calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      createElement(UpdateBanner, {
        status: makeStatus({ state: 'FAILED', error: 'test error' }),
        onStartUpdate: vi.fn(),
        onCancelUpdate: vi.fn(),
        onDismiss,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
