/**
 * Purpose: Tests for ShareAssetModal — real scan pipeline, complete confirmation with CID + Done
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { ShareAssetModal } from '../ShareAssetModal';
import { ToastProvider, useToast } from '@/providers/ToastProvider';

/* ── Mocks ── */

const { mockShareFile } = vi.hoisted(() => ({
  mockShareFile: vi.fn().mockResolvedValue({ cid: 'bafybeigtest123', message: 'Asset shared successfully' }),
}));

// The modal disables sharing while the agent is offline; these tests run it connected
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

vi.mock('@/lib/api/daemon', () => ({
  daemonApi: { shareFile: mockShareFile },
  /* AgentRequiredNotice carries the local access banner, whose probe reads these at load. */
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
  // Keep class export so ShareAssetModal can do `instanceof DuplicateContentError`
  DuplicateContentError: class DuplicateContentError extends Error {
    existing: { cid?: string; filename?: string; size?: number };
    constructor(existing: { cid?: string; filename?: string; size?: number }) {
      super('File already shared');
      this.name = 'DuplicateContentError';
      this.existing = existing;
    }
  },
}));

const { mockValidateFileType, mockScanForScripts, mockValidateFileFormat } = vi.hoisted(() => ({
  mockValidateFileType: vi.fn().mockResolvedValue({ passed: true, message: 'File type verified' }),
  mockScanForScripts: vi.fn().mockResolvedValue({ passed: true, message: 'No scripts detected' }),
  mockValidateFileFormat: vi.fn().mockResolvedValue({ passed: true, message: 'Format validated' }),
}));

vi.mock('@/lib/utils/file-scan', () => ({
  validateFileType: mockValidateFileType,
  scanForScripts: mockScanForScripts,
  validateFileFormat: mockValidateFileFormat,
}));

function ToastSpy() {
  const { toasts } = useToast();
  return (
    <div data-testid="toast-spy">
      {toasts.map(t => (
        <div key={t.id} data-testid={`toast-${t.variant}`}>
          {t.title}
        </div>
      ))}
    </div>
  );
}

// jsdom polyfill
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

/** Helper: select file and click Share to the network, wait for pipeline to settle */
async function selectFileAndShare(onClose: () => void, fileName = 'test.txt') {
  render(
    <ToastProvider>
      <ShareAssetModal open={true} onClose={onClose} />
      <ToastSpy />
    </ToastProvider>,
  );
  const input = screen.getByTestId('share-file-input');
  const file = new File(['test'], fileName, { type: '' });

  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });

  await act(async () => {
    fireEvent.click(screen.getByText(/share to the network/i));
  });

  // Let all microtasks (async scan pipeline) settle
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
}

describe('ShareAssetModal — basic rendering', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockShareFile.mockClear();
    mockShareFile.mockResolvedValue({ cid: 'bafybeigtest123', message: 'ok' });
    mockValidateFileType.mockClear();
    mockValidateFileType.mockResolvedValue({ passed: true, message: 'File type verified' });
    mockScanForScripts.mockClear();
    mockScanForScripts.mockResolvedValue({ passed: true, message: 'No scripts detected' });
    mockValidateFileFormat.mockClear();
    mockValidateFileFormat.mockResolvedValue({ passed: true, message: 'Format validated' });
  });

  it('renders nothing when closed', () => {
    render(<ShareAssetModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId('share-asset-modal')).not.toBeInTheDocument();
  });

  it('renders dropzone when open', () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    expect(screen.getByText(/drag file or click to browse/i)).toBeInTheDocument();
  });

  it('shows file metadata after file selection', async () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    const input = screen.getByTestId('share-file-input');
    const file = new File(['test content'], 'my-prompt.md', { type: '' });
    Object.defineProperty(file, 'size', { value: 25480396 });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByText('my-prompt.md')).toBeInTheDocument();
    expect(screen.getByText(/24\.3 MB/)).toBeInTheDocument();
    expect(screen.getByTestId('share-cid')).toBeInTheDocument();
  });

  it('file input accepts only the plain-text allowlist', () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    const accept = screen.getByTestId('share-file-input').getAttribute('accept') ?? '';
    const parts = accept.split(',');
    for (const ext of ['.txt', '.md', '.json', '.csv', '.yaml', '.yml', '.py', '.js', '.ts', '.go', '.sh']) {
      expect(parts, ext).toContain(ext);
    }
    for (const ext of ['.png', '.pdf', '.zip', '.exe', '.env', '.safetensors', '.claw-prompt']) {
      expect(parts, ext).not.toContain(ext);
    }
  });

  it('states the plain-text rule in the dropzone helper text', () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    expect(screen.getByTestId('share-rule-hint')).toHaveTextContent(
      'Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).',
    );
  });

  it('refuses a non-plain-text file at selection, before any upload', async () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    const input = screen.getByTestId('share-file-input');
    const file = new File(['binary'], 'model.safetensors', { type: '' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).',
    );
    // No file is held, so there is nothing to share and the dropzone is ready for another pick
    expect(screen.queryByTestId('share-to-swarm-btn')).not.toBeInTheDocument();
    expect(screen.getByText(/drag file or click to browse/i)).toBeInTheDocument();
    expect(mockShareFile).not.toHaveBeenCalled();
    expect(mockValidateFileType).not.toHaveBeenCalled();
  });

  it('accepts an uppercase plain-text extension at selection', async () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    const input = screen.getByTestId('share-file-input');
    const file = new File(['text'], 'NOTES.TXT', { type: '' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('share-to-swarm-btn')).toBeInTheDocument();
  });

  it('closes modal when Cancel is clicked', () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets state when reopened', async () => {
    const { rerender } = render(<ShareAssetModal open={true} onClose={onClose} />);
    const input = screen.getByTestId('share-file-input');
    const file = new File(['test'], 'test.txt', { type: '' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    rerender(<ShareAssetModal open={false} onClose={onClose} />);
    rerender(<ShareAssetModal open={true} onClose={onClose} />);

    expect(screen.getByText(/drag file or click to browse/i)).toBeInTheDocument();
  });

  it('shows Change File button when file is selected', async () => {
    render(<ShareAssetModal open={true} onClose={onClose} />);
    const input = screen.getByTestId('share-file-input');
    const file = new File(['test'], 'test.txt', { type: '' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const changeBtn = screen.getByRole('button', { name: /change file/i });
    fireEvent.click(changeBtn);

    expect(screen.getByText(/drag file or click to browse/i)).toBeInTheDocument();
  });
});

describe('ShareAssetModal — real scan pipeline', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockShareFile.mockClear();
    mockShareFile.mockResolvedValue({ cid: 'bafybeigtest123', message: 'ok' });
    mockValidateFileType.mockClear();
    mockValidateFileType.mockResolvedValue({ passed: true, message: 'File type verified' });
    mockScanForScripts.mockClear();
    mockScanForScripts.mockResolvedValue({ passed: true, message: 'No scripts detected' });
    mockValidateFileFormat.mockClear();
    mockValidateFileFormat.mockResolvedValue({ passed: true, message: 'Format validated' });
  });

  it('runs all scan checks when sharing a file', async () => {
    await selectFileAndShare(onClose);

    // All 3 scan utilities should have been called
    expect(mockValidateFileType).toHaveBeenCalledTimes(1);
    expect(mockScanForScripts).toHaveBeenCalledTimes(1);
    expect(mockShareFile).toHaveBeenCalledTimes(1);
    expect(mockValidateFileFormat).toHaveBeenCalledTimes(1);
  });

  it('shows scan progress with all checks passed on success', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      const passed = screen.getAllByTestId('scan-check-passed');
      expect(passed.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('shows CID display in complete state', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('share-complete-cid')).toHaveTextContent(/bafybeigtest123/);
    });
  });

  it('shows copyable CID with copy button in complete state', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('share-complete-copy-btn')).toBeInTheDocument();
    });
  });

  it('shows Done button in complete state', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('share-done-btn')).toBeInTheDocument();
    });
  });

  it('Done button calls onClose', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('share-done-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('share-done-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT auto-close after scan completes', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('share-done-btn')).toBeInTheDocument();
    });

    // Modal should still be open — onClose not called automatically
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows success toast after scan completes', async () => {
    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByTestId('toast-success')).toHaveTextContent(/bafybeigtest123/i);
    });
  });
});

describe('ShareAssetModal — scan failure handling', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockShareFile.mockClear();
    mockShareFile.mockResolvedValue({ cid: 'bafybeigtest123', message: 'ok' });
    mockValidateFileType.mockClear();
    mockValidateFileType.mockResolvedValue({ passed: true, message: 'File type verified' });
    mockScanForScripts.mockClear();
    mockScanForScripts.mockResolvedValue({ passed: true, message: 'No scripts detected' });
    mockValidateFileFormat.mockClear();
    mockValidateFileFormat.mockResolvedValue({ passed: true, message: 'Format validated' });
  });

  it('shows error when file type validation fails', async () => {
    mockValidateFileType.mockResolvedValue({ passed: false, message: 'File contains ELF executable binary' });

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/executable/i);
    });
  });

  it('shows error when script scan fails', async () => {
    mockScanForScripts.mockResolvedValue({ passed: false, message: 'Embedded script detected' });

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/script/i);
    });
  });

  it('shows error when daemon upload fails', async () => {
    mockShareFile.mockRejectedValue(new Error('Network timeout'));

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network timeout/i);
    });
  });

  it('shows the plain-text rule when the daemon answers 415 UNSUPPORTED_FILE_TYPE', async () => {
    // daemonApi.shareFile maps the 415 to an error whose message is the rule sentence
    const err = new Error('Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).');
    err.name = 'UnsupportedFileTypeError';
    mockShareFile.mockRejectedValue(err);

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only plain-text files can be shared (.txt, .md, .json, .csv, .yaml, code files and similar).',
      );
    });
  });

  it('shows error when daemon returns null', async () => {
    mockShareFile.mockResolvedValue(null);

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/your agent is offline/i);
    });
  });

  it('does NOT upload to swarm when file format validation fails', async () => {
    mockValidateFileFormat.mockResolvedValue({ passed: false, message: 'Invalid file format header' });

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid file format/i);
    });

    // File must NOT be uploaded if any validation fails
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('allows retry after scan failure', async () => {
    mockValidateFileType
      .mockResolvedValueOnce({ passed: false, message: 'Bad file' })
      .mockResolvedValueOnce({ passed: true, message: 'ok' });

    await selectFileAndShare(onClose);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Retry button should be available
    const retryBtn = screen.getByTestId('share-to-swarm-btn');
    expect(retryBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(mockValidateFileType).toHaveBeenCalledTimes(2);
    });
  });
});
