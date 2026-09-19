/**
 * Purpose: Share Asset modal — dropzone, real file scan pipeline, daemon upload, complete confirmation
 */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ShareDropzone } from './ShareDropzone';
import { ShareScanProgress } from './ShareScanProgress';
import { ShareCompleteConfirmation } from './ShareCompleteConfirmation';
import { daemonApi, DuplicateContentError } from '@/lib/api/daemon';
import { validateFileType, scanForScripts, validateFileFormat } from '@/lib/utils/file-scan';
import { isShareableFilename, SHARE_RULE_MESSAGE } from '@/lib/utils/share-rules';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';

interface ShareAssetModalProps {
  open: boolean;
  onClose: () => void;
}

interface DuplicateInfo {
  cid?: string;
  filename?: string;
  size?: number;
}

type ModalState = 'idle' | 'selected' | 'scanning' | 'complete' | 'error' | 'duplicate';

export function ShareAssetModal({ open, onClose }: ShareAssetModalProps) {
  const { addToast } = useToast();
  /* The upload goes to the agent. The sidebar never opens this offline; if the agent drops
     mid-flow, the share button is disabled with the notice instead of a failed upload. */
  const { connected: agentConnected, title: agentTitle } = useAgentRequired();
  const [state, setState] = useState<ModalState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [cid, setCid] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setState('idle');
      setFile(null);
      setCid('');
      setErrorMessage('');
      setScanProgress(0);
      setDragging(false);
      setDuplicateInfo(null);
      abortRef.current = true;
    } else {
      abortRef.current = false;
    }
  }, [open]);

  const handleFile = useCallback((selected: File) => {
    setCid('');
    // Plain-text rule, checked before anything is uploaded: the daemon would answer 415 anyway
    if (!isShareableFilename(selected.name)) {
      setFile(null);
      setErrorMessage(SHARE_RULE_MESSAGE);
      setState('error');
      return;
    }
    setFile(selected);
    setErrorMessage('');
    setState('selected');
  }, []);

  const handleCopyCid = useCallback(() => {
    if (cid) navigator.clipboard.writeText(cid);
  }, [cid]);

  const handleChangeFile = useCallback(() => {
    setFile(null);
    setCid('');
    setErrorMessage('');
    setScanProgress(0);
    setDuplicateInfo(null);
    setState('idle');
  }, []);

  const shareToSwarm = useCallback(
    async (force = false) => {
      if (!file) return;
      setErrorMessage('');
      setScanProgress(0);
      setDuplicateInfo(null);
      setState('scanning');
      abortRef.current = false;

      try {
        if (!force) {
          const typeResult = await validateFileType(file);
          if (abortRef.current) return;
          if (!typeResult.passed) {
            setErrorMessage(typeResult.message);
            setState('error');
            return;
          }
          setScanProgress(1);

          const scriptResult = await scanForScripts(file);
          if (abortRef.current) return;
          if (!scriptResult.passed) {
            setErrorMessage(scriptResult.message);
            setState('error');
            return;
          }
          setScanProgress(2);

          const formatResult = await validateFileFormat(file);
          if (abortRef.current) return;
          if (!formatResult.passed) {
            setErrorMessage(formatResult.message);
            setState('error');
            return;
          }
          setScanProgress(3);
        } else {
          setScanProgress(3);
        }

        const result = await daemonApi.shareFile(file, { force });
        if (abortRef.current) return;
        if (!result) {
          setErrorMessage('Your agent is offline. Start it to share files.');
          setState('error');
          return;
        }
        setCid(result.cid);
        setScanProgress(4);

        setState('complete');
        addToast({
          title: `Shared: ${result.cid}`,
          description: 'Asset is live on the network',
          variant: 'success',
          autoDismiss: true,
        });
      } catch (err) {
        if (abortRef.current) return;
        if (err instanceof DuplicateContentError) {
          setDuplicateInfo(err.existing);
          setState('duplicate');
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
        setState('error');
      }
    },
    [file, addToast],
  );

  if (!open) return null;

  const showDropzone = state === 'idle' || state === 'selected' || state === 'error';
  const showScan = state === 'scanning' || state === 'complete';
  const showFooter = state !== 'scanning';

  return (
    <Modal open={open} onClose={onClose} title="Share Asset" maxWidth="max-w-[480px]">
      <div className="flex flex-col gap-4" data-testid="share-asset-modal">
        {showDropzone && (
          <ShareDropzone
            file={file}
            cid={cid}
            dragging={dragging}
            onFile={handleFile}
            onDragging={setDragging}
            onCopyCid={handleCopyCid}
          />
        )}

        <AgentRequiredNotice data-testid="share-agent-required" />

        {state === 'error' && errorMessage && (
          <div
            className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400"
            role="alert"
            data-testid="share-error"
          >
            {errorMessage}
          </div>
        )}

        {state === 'duplicate' && duplicateInfo && (
          <div
            className="rounded-lg bg-accent-yellow/10 border border-accent-yellow/30 p-4 flex flex-col gap-3"
            data-testid="share-duplicate-warning"
          >
            <div className="flex items-start gap-3">
              <Icon name="alert-triangle" className="text-accent-yellow w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-text-primary">This file already exists in your library</p>
                <p className="text-xs text-text-secondary">
                  Stored as <span className="font-mono text-text-primary">{duplicateInfo.filename}</span>
                  {duplicateInfo.size != null && <span> ({(duplicateInfo.size / 1024).toFixed(1)} KB)</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                data-testid="share-duplicate-cancel"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDuplicateInfo(null);
                  setState('selected');
                }}
              >
                Cancel
              </Button>
              <Button
                data-testid="share-duplicate-update"
                variant="primary"
                size="sm"
                icon="upload"
                onClick={() => agentConnected && shareToSwarm(true)}
                disabled={!agentConnected}
                title={agentTitle}
              >
                Update Existing
              </Button>
            </div>
          </div>
        )}

        {showScan && <ShareScanProgress scanProgress={scanProgress} complete={state === 'complete'} />}

        {state === 'complete' && cid && <ShareCompleteConfirmation cid={cid} onCopyCid={handleCopyCid} />}

        {showFooter && state !== 'duplicate' && (
          <div className="flex gap-2 justify-end">
            {(state === 'selected' || state === 'error') && file && (
              <Button variant="ghost" size="sm" onClick={handleChangeFile}>
                Change File
              </Button>
            )}
            {state === 'complete' ? (
              <Button data-testid="share-done-btn" variant="primary" icon="check" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
                <Button data-testid="share-cancel-btn" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                {(state === 'selected' || state === 'error') && file && (
                  <Button
                    data-testid="share-to-swarm-btn"
                    variant="primary"
                    icon="share-2"
                    onClick={() => agentConnected && shareToSwarm()}
                    disabled={!agentConnected}
                    title={agentTitle}
                  >
                    Share to the network
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
