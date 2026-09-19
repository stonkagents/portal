/**
 * Purpose: Settings > Identity display name: loads from the agent, Save is
 *          disabled until the draft differs and is within 50 chars, a save
 *          POSTs the sanitized name and toasts, a refusal toasts the daemon's
 *          message, and offline the field is inert with the agent notice.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as IdentityModule from '@/lib/api/daemon-identity';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/providers/I18nProvider';
import type { ReactNode } from 'react';
import type * as SetupModule from '@/lib/api/daemon-setup';

const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';

const mockDaemon = vi.hoisted(() => ({
  connected: true,
  health: { peerId: '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab' },
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));

const identityClient = vi.hoisted(() => ({
  getAgentIdentity: vi.fn(),
  saveAgentIdentity: vi.fn(),
}));
vi.mock('@/lib/api/daemon-identity', async importOriginal => {
  const actual = await importOriginal<typeof IdentityModule>();
  return { ...actual, ...identityClient };
});

const setupClient = vi.hoisted(() => ({
  getSetupStatus: vi.fn(),
  applySetupFix: vi.fn(),
}));
vi.mock('@/lib/api/daemon-setup', async importOriginal => {
  const actual = await importOriginal<typeof SetupModule>();
  return { ...actual, ...setupClient };
});

import { IdentityTab, IDENTITY_EXPORT_FILENAME, PRIVATE_KEY_NOTE } from '../_components/IdentityTab';
import { BANDWIDTH_SAVED_TOAST } from '../_components/BandwidthSection';
import { DISPLAY_NAME_SAVED_TOAST, DISPLAY_NAME_SYNCING_NOTE } from '../_components/DisplayNameField';

const PUBLIC_KEY = 'dGhpcyBpcyBhIHB1YmxpYyBrZXk=';

/** jsdom's Blob has no text(); FileReader works. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
const SETUP_STATUS = {
  checks: [
    { id: 'tracker', status: 'ok', detail: { trackerUrl: 'https://tracker.example.test' } },
    { id: 'bandwidth', status: 'ok', detail: { uploadMbps: 20, downloadMbps: 100 } },
  ],
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
  return render(<IdentityTab />, { wrapper: Wrapper });
}

const input = () => screen.getByTestId('settings-display-name') as HTMLInputElement;
const saveButton = () => screen.getByTestId('settings-display-name-save') as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
  identityClient.getAgentIdentity.mockResolvedValue({ kind: 'ok', identity: { peerId: PEER_ID, displayName: 'Alice' } });
  setupClient.getSetupStatus.mockResolvedValue({ kind: 'ok', status: SETUP_STATUS });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('IdentityTab public key', () => {
  it('hides the public key row while the agent does not report one, and never invents a value', async () => {
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));
    expect(screen.queryByTestId('settings-pubkey')).toBeNull();
    expect(screen.queryByTestId('settings-export-identity')).toBeNull();
    expect(screen.getByTestId('settings-private-key-note')).toHaveTextContent(PRIVATE_KEY_NOTE);
  });

  it('shows the real key, copies it, and exports {peerId, publicKey} as JSON', async () => {
    identityClient.getAgentIdentity.mockResolvedValue({
      kind: 'ok',
      identity: { peerId: PEER_ID, displayName: 'Alice', publicKey: PUBLIC_KEY },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:identity');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderTab();
    await waitFor(() => expect((screen.getByTestId('settings-pubkey') as HTMLInputElement).value).toBe(PUBLIC_KEY));

    fireEvent.click(screen.getByTestId('settings-pubkey-copy'));
    expect(writeText).toHaveBeenCalledWith(PUBLIC_KEY);

    fireEvent.click(screen.getByTestId('settings-pubkey-export'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await readBlob(blob))).toEqual({ peerId: PEER_ID, publicKey: PUBLIC_KEY });
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:identity');
    expect(IDENTITY_EXPORT_FILENAME).toMatch(/\.json$/);
  });
});

describe('IdentityTab network', () => {
  it('shows the tracker URL the agent reports, read-only', async () => {
    renderTab();
    const tracker = await screen.findByTestId('settings-tracker-url');
    await waitFor(() => expect((tracker as HTMLInputElement).value).toBe('https://tracker.example.test'));
    expect(tracker).toHaveAttribute('readonly');
  });

  it('loads the caps in Mbps and saves changed caps through the bandwidth fix with a body', async () => {
    setupClient.applySetupFix.mockResolvedValueOnce({
      kind: 'ok',
      check: { id: 'bandwidth', status: 'ok', detail: { uploadMbps: 25, downloadMbps: 100 } },
      restartRequired: false,
    });
    renderTab();
    const up = (await screen.findByTestId('settings-max-upload')) as HTMLInputElement;
    const down = screen.getByTestId('settings-max-download') as HTMLInputElement;
    await waitFor(() => expect(up.value).toBe('20'));
    expect(down.value).toBe('100');
    const save = screen.getByTestId('settings-bandwidth-save');
    expect(save).toBeDisabled();

    fireEvent.change(up, { target: { value: '25' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(setupClient.applySetupFix).toHaveBeenCalledWith('bandwidth', { uploadMbps: 25, downloadMbps: 100 }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: BANDWIDTH_SAVED_TOAST, variant: 'success' })),
    );
  });

  it('refuses a cap that is not a positive number and toasts a daemon refusal', async () => {
    setupClient.applySetupFix.mockResolvedValueOnce({
      kind: 'error',
      message: 'uploadMbps above the maximum',
      code: 'INVALID_REQUEST',
    });
    renderTab();
    const up = (await screen.findByTestId('settings-max-upload')) as HTMLInputElement;
    await waitFor(() => expect(up.value).toBe('20'));

    fireEvent.change(up, { target: { value: '0' } });
    expect(screen.getByTestId('settings-bandwidth-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('settings-bandwidth-save')).toBeDisabled();

    fireEvent.change(up, { target: { value: '99999' } });
    fireEvent.click(screen.getByTestId('settings-bandwidth-save'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'uploadMbps above the maximum' }),
      ),
    );
  });

  it('has no Max Connections, Port or UPnP controls', async () => {
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));
    expect(screen.queryByTestId('settings-max-connections')).toBeNull();
    expect(screen.queryByTestId('settings-port')).toBeNull();
    expect(screen.queryByTestId('settings-upnp')).toBeNull();
  });
});

describe('IdentityTab display name', () => {
  it('loads the current name from the agent and keeps Save disabled until it changes', async () => {
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByTestId('settings-display-name-agent-required')).not.toBeInTheDocument();

    fireEvent.change(input(), { target: { value: 'Alice 2' } });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(input(), { target: { value: '  Alice ' } });
    expect(saveButton()).toBeDisabled();
  });

  it('saves the sanitized name, updates the field and toasts', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'ok', identity: { peerId: PEER_ID, displayName: 'Bob' } });
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));

    /* The save invalidates the identity query; the agent then answers with the new name. */
    identityClient.getAgentIdentity.mockResolvedValue({ kind: 'ok', identity: { peerId: PEER_ID, displayName: 'Bob' } });
    fireEvent.change(input(), { target: { value: ' <Bob> ' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(identityClient.saveAgentIdentity).toHaveBeenCalledWith('Bob'));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: DISPLAY_NAME_SAVED_TOAST, variant: 'success' })),
    );
    expect(input().value).toBe('Bob');
    expect(saveButton()).toBeDisabled();
  });

  it('clears the name with an empty save', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'ok', identity: { peerId: PEER_ID, displayName: '' } });
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));

    fireEvent.change(input(), { target: { value: '' } });
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(identityClient.saveAgentIdentity).toHaveBeenCalledWith(''));
  });

  it('refuses a name over 50 characters before asking the agent', async () => {
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));

    fireEvent.change(input(), { target: { value: 'x'.repeat(51) } });
    expect(screen.getByTestId('settings-display-name-too-long')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(identityClient.saveAgentIdentity).not.toHaveBeenCalled();
  });

  it('toasts the daemon message when the save is refused', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'error', message: 'Names are taken', code: 'INVALID_REQUEST' });
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));

    fireEvent.change(input(), { target: { value: 'Taken' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', description: 'Names are taken' })),
    );
    expect(input().value).toBe('Taken');
  });

  it('is inert with the agent notice while the agent is offline', () => {
    mockDaemon.connected = false;
    renderTab();
    expect(input()).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId('settings-display-name-agent-required')).toBeInTheDocument();
    expect(identityClient.getAgentIdentity).not.toHaveBeenCalled();
  });

  it('explains an agent that has no identity endpoint yet', async () => {
    identityClient.getAgentIdentity.mockResolvedValue({ kind: 'unsupported' });
    renderTab();
    await waitFor(() => expect(screen.getByTestId('settings-display-name-unsupported')).toBeInTheDocument());
    expect(input()).toBeDisabled();
  });
  it('says the network is still syncing when the tracker has not acknowledged the name', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({
      kind: 'ok',
      identity: { peerId: PEER_ID, displayName: 'Bob', trackerSynced: false, trackerError: 'timeout' },
    });
    renderTab();
    await waitFor(() => expect(input().value).toBe('Alice'));
    identityClient.getAgentIdentity.mockResolvedValue({ kind: 'ok', identity: { peerId: PEER_ID, displayName: 'Bob' } });

    fireEvent.change(input(), { target: { value: 'Bob' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: DISPLAY_NAME_SAVED_TOAST, description: DISPLAY_NAME_SYNCING_NOTE, variant: 'success' }),
      ),
    );
  });
});
