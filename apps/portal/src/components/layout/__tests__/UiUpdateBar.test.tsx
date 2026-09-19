/**
 * Purpose: Tests for UiUpdateBar (S3) — offers a reload when the deployed build id differs, never reloads on its own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { UiUpdateBar, fetchDeployedBuildId, UI_UPDATE_CHECK_MS } from '../UiUpdateBar';

const fetchMock = vi.fn();

function text(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchDeployedBuildId', () => {
  it('reads one short token from /build-id.txt and rejects an app-shell answer', async () => {
    fetchMock.mockResolvedValueOnce(text('abc1234\n'));
    expect(await fetchDeployedBuildId()).toBe('abc1234');
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/build-id.txt');
    fetchMock.mockResolvedValueOnce(text('<!doctype html><html></html>'));
    expect(await fetchDeployedBuildId()).toBeNull();
    fetchMock.mockResolvedValueOnce(text('', 404));
    expect(await fetchDeployedBuildId()).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchDeployedBuildId()).toBeNull();
  });
});

describe('UiUpdateBar', () => {
  it('renders nothing until a different build id is seen on focus', async () => {
    fetchMock.mockResolvedValue(text('same'));
    render(<UiUpdateBar currentBuildId="same" />);
    expect(screen.queryByTestId('ui-update-bar')).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.queryByTestId('ui-update-bar')).not.toBeInTheDocument();
  });

  it('shows the bar with a Reload button when the deployed id differs, and does not auto-reload', async () => {
    fetchMock.mockResolvedValue(text('newer'));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<UiUpdateBar currentBuildId="older" />);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('ui-update-bar')).toBeInTheDocument());
    expect(screen.getByText('A new version is available.')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ui-update-reload'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('checks again every 10 minutes', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(text('newer'));
    render(<UiUpdateBar currentBuildId="older" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(UI_UPDATE_CHECK_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never fetches without a build id', async () => {
    render(<UiUpdateBar currentBuildId="" />);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
