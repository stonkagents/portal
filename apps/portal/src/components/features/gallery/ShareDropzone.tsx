/**
 * Purpose: Dropzone + file preview for Share Asset modal
 */
'use client';

import { useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui/Icon';
import { SHARE_ACCEPT, SHARE_RULE_MESSAGE, shareFileExtension } from '@/lib/utils/share-rules';

interface ShareDropzoneProps {
  file: File | null;
  cid: string;
  dragging: boolean;
  onFile: (f: File) => void;
  onDragging: (d: boolean) => void;
  onCopyCid: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function detectFileType(name: string): string {
  return shareFileExtension(name) || name;
}

export function ShareDropzone({ file, cid, dragging, onFile, onDragging, onCopyCid }: ShareDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = file !== null;

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFile(selected);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      onDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile, onDragging],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      onDragging(true);
    },
    [onDragging],
  );

  const handleDragLeave = useCallback(() => {
    onDragging(false);
  }, [onDragging]);

  const handleZoneClick = useCallback(() => {
    if (!hasFile) inputRef.current?.click();
  }, [hasFile]);

  const handleCopyCidClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCopyCid();
    },
    [onCopyCid],
  );

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer min-h-[160px]',
        dragging
          ? 'border-accent-green bg-accent-green/5'
          : hasFile
            ? 'border-border-default bg-bg-secondary'
            : 'border-border-default hover:border-accent-green/50 hover:bg-accent-green/3',
      )}
      role="button"
      tabIndex={0}
      onClick={handleZoneClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleZoneClick();
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="share-dropzone"
    >
      <input
        ref={inputRef}
        data-testid="share-file-input"
        type="file"
        accept={SHARE_ACCEPT}
        onChange={handleInputChange}
        className="hidden"
      />

      {!hasFile ? (
        <div className="flex flex-col items-center gap-2 text-text-secondary">
          <Icon name="upload-cloud" size="xl" className="text-text-tertiary" />
          <span className="text-sm font-medium">Drag file or click to browse</span>
          <span className="text-xs text-text-tertiary text-center" data-testid="share-rule-hint">
            {SHARE_RULE_MESSAGE}
          </span>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">File:</span>
            <span className="font-semibold text-text-primary truncate ml-2">{file.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Size:</span>
            <span className="font-semibold text-text-primary">{formatFileSize(file.size)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-secondary">CID:</span>
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-mono text-xs text-text-primary truncate" data-testid="share-cid">
                {cid || '-'}
              </span>
              {cid && (
                <button
                  data-testid="copy-cid-btn"
                  onClick={handleCopyCidClick}
                  className="shrink-0 p-1 rounded hover:bg-accent-green/10 text-text-tertiary hover:text-accent-green transition-colors"
                  aria-label="Copy CID"
                >
                  <Icon name="copy" size="sm" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Type:</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded border uppercase tracking-wide text-accent-green border-accent-green/30 bg-accent-green/8">
              {detectFileType(file.name)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
