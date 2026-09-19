/**
 * Purpose: The in-place editor an author gets on their own post or reply within
 *          the tracker's edit window (round 2): the mention-aware textarea
 *          prefilled with the current text, Save and Cancel, Ctrl+Enter saves,
 *          Escape cancels. The caller sends the text and closes the editor.
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { MentionTextarea } from './MentionTextarea';
import { isSubmitShortcut } from '../_lib/drafts';

interface InlineEditorProps {
  /** Prefix for test ids: `${testId}-editor`, `${testId}-editor-save`, `${testId}-editor-cancel`. */
  testId: string;
  initial: string;
  saving?: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export function InlineEditor({ testId, initial, saving, onSave, onCancel }: InlineEditorProps) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const canSave = trimmed !== '' && trimmed !== initial.trim() && !saving;
  const save = () => {
    if (canSave) onSave(trimmed);
  };
  return (
    <div className="flex flex-col gap-2 mt-1" data-testid={`${testId}-editor`}>
      <MentionTextarea
        data-testid={`${testId}-editor-textarea`}
        className="min-h-[72px] p-2 bg-bg-tertiary border border-border-default rounded text-sm text-text-primary font-mono resize-y outline-none focus:border-accent-green/50"
        value={value}
        onChange={setValue}
        disabled={saving}
        autoFocus
        onKeyDown={e => {
          if (isSubmitShortcut(e)) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button data-testid={`${testId}-editor-save`} variant="primary" size="sm" icon="check" onClick={save} disabled={!canSave}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button data-testid={`${testId}-editor-cancel`} variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <span className="text-[11px] text-text-tertiary">Ctrl+Enter saves, Escape cancels</span>
      </div>
    </div>
  );
}
