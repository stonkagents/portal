/**
 * Purpose: Settings > Identity > Network bandwidth caps. Two Mbps inputs bound to the
 *          agent's `bandwidth` setup check; Save POSTs {uploadMbps, downloadMbps} to
 *          the bandwidth fix and toasts the outcome. Inert with the agent notice offline.
 */
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { readBandwidthCaps } from '@/lib/api/daemon-setup';
import { useSetupCheck, useSetupFix, SETUP_UNSUPPORTED_MESSAGE } from '@/lib/api/hooks/use-agent-settings';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { FormField, InputWithSuffix } from './shared';

export const BANDWIDTH_SAVED_TOAST = 'Bandwidth caps saved';
export const BANDWIDTH_HELPER =
  'Caps in megabits per second. Your agent applies them at once; a typical home line is 100 to 1000 Mbps.';

/** A cap the daemon will accept: a positive finite number of Mbps. */
export function parseMbps(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

const asDraft = (n: number | null) => (n === null ? '' : String(n));

export function BandwidthSection() {
  const { connected } = useDaemon();
  const { addToast } = useToast();
  const { check, loading, unsupported } = useSetupCheck('bandwidth');
  const fix = useSetupFix();

  const caps = readBandwidthCaps(check);
  const [upload, setUpload] = useState(asDraft(caps.uploadMbps));
  const [download, setDownload] = useState(asDraft(caps.downloadMbps));

  /* A fresh answer from the agent (first load, a save, another tab) resets the drafts. */
  useEffect(() => {
    setUpload(asDraft(caps.uploadMbps));
    setDownload(asDraft(caps.downloadMbps));
  }, [caps.uploadMbps, caps.downloadMbps]);

  const uploadMbps = parseMbps(upload);
  const downloadMbps = parseMbps(download);
  const valid = uploadMbps !== null && downloadMbps !== null;
  const changed = uploadMbps !== caps.uploadMbps || downloadMbps !== caps.downloadMbps;
  const editable = connected && !unsupported && !loading;
  const canSave = editable && valid && changed && !fix.isPending;

  function handleSave() {
    if (!canSave || uploadMbps === null || downloadMbps === null) return;
    fix.mutate(
      { id: 'bandwidth', params: { uploadMbps, downloadMbps } },
      {
        onSuccess: () => addToast({ title: BANDWIDTH_SAVED_TOAST, variant: 'success' }),
        onError: error => addToast({ title: 'Could not save bandwidth caps', description: error.message, variant: 'error' }),
      },
    );
  }

  return (
    <FormField label="Bandwidth Caps" helper={BANDWIDTH_HELPER}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <InputWithSuffix
          suffix="Mbps up"
          type="number"
          min={1}
          step={1}
          value={upload}
          onChange={setUpload}
          disabled={!editable}
          placeholder={connected ? 'Upload cap' : 'Agent offline'}
          ariaLabel="Upload cap in Mbps"
          testId="settings-max-upload"
        />
        <InputWithSuffix
          suffix="Mbps down"
          type="number"
          min={1}
          step={1}
          value={download}
          onChange={setDownload}
          disabled={!editable}
          placeholder={connected ? 'Download cap' : 'Agent offline'}
          ariaLabel="Download cap in Mbps"
          testId="settings-max-download"
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        icon="check"
        onClick={handleSave}
        disabled={!canSave}
        loading={fix.isPending}
        data-testid="settings-bandwidth-save"
      >
        Save caps
      </Button>
      {connected && !valid && (upload !== '' || download !== '') && (
        <p className="text-xs text-accent-red mt-1" role="alert" data-testid="settings-bandwidth-invalid">
          Each cap must be a number above zero.
        </p>
      )}
      {unsupported && (
        <p className="text-xs text-accent-yellow mt-1" role="status" data-testid="settings-bandwidth-unsupported">
          {SETUP_UNSUPPORTED_MESSAGE}
        </p>
      )}
      {!connected && <AgentRequiredNotice className="mt-2" data-testid="settings-bandwidth-agent-required" />}
    </FormField>
  );
}
