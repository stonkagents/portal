/**
 * Purpose: Tests for daemonApi.shareFile error mapping: 415 UNSUPPORTED_FILE_TYPE becomes the
 *          plain-text rule sentence, 409 stays DuplicateContentError, other failures keep their message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: 'http://localhost:7842',
  trackerUrl: 'http://localhost:7842',
  daemonUrl: 'http://localhost:7841/api/v1',
  controllerUrl: 'http://localhost:7840',
  useRealDaemon: true,
}));
vi.mock('@/lib/config/app.config', () => ({ appConfig: mockConfig }));

import { daemonApi, DuplicateContentError, UnsupportedFileTypeError } from '../daemon';
import { SHARE_RULE_MESSAGE } from '@/lib/utils/share-rules';

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: 'x', json: () => Promise.resolve(body) } as Response;
}

describe('daemonApi.shareFile', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('posts multipart to /api/v1/share and returns the cid', async () => {
    mockFetch.mockResolvedValue(response(201, { cid: 'bafyok', message: 'Asset shared successfully' }));
    const result = await daemonApi.shareFile(new File(['hi'], 'notes.txt'));
    expect(result).toEqual({ cid: 'bafyok', message: 'Asset shared successfully' });
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:7841/api/v1/share');
    expect(mockFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it('maps 415 UNSUPPORTED_FILE_TYPE to UnsupportedFileTypeError carrying the rule sentence', async () => {
    mockFetch.mockResolvedValue(
      response(415, {
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Only plain-text files can be shared: .txt, .md, .json, .csv, .yaml, code files and similar.',
          details: { reason: 'file extension is not a plain-text format' },
        },
      }),
    );
    const err = await daemonApi.shareFile(new File(['x'], 'model.safetensors')).catch(e => e);
    expect(err).toBeInstanceOf(UnsupportedFileTypeError);
    expect(err.message).toBe(SHARE_RULE_MESSAGE);
    expect(err.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('maps a 415 with no JSON body the same way', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 415,
      statusText: 'Unsupported Media Type',
      json: () => Promise.reject(new Error('no json')),
    } as unknown as Response);
    const err = await daemonApi.shareFile(new File(['x'], 'photo.png')).catch(e => e);
    expect(err).toBeInstanceOf(UnsupportedFileTypeError);
    expect(err.message).toBe(SHARE_RULE_MESSAGE);
  });

  it('keeps 409 DUPLICATE_CONTENT as DuplicateContentError', async () => {
    mockFetch.mockResolvedValue(
      response(409, { error: { code: 'DUPLICATE_CONTENT', message: 'File already shared', details: { cid: 'bafydup' } } }),
    );
    const err = await daemonApi.shareFile(new File(['x'], 'notes.txt')).catch(e => e);
    expect(err).toBeInstanceOf(DuplicateContentError);
    expect(err.existing.cid).toBe('bafydup');
  });

  it('names the agent when the upload never reaches it', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await daemonApi.shareFile(new File(['x'], 'notes.txt')).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Can't reach your agent.");
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('surfaces other daemon errors by their message', async () => {
    mockFetch.mockResolvedValue(response(500, { error: { code: 'INTERNAL_ERROR', message: 'Failed to chunk file' } }));
    const err = await daemonApi.shareFile(new File(['x'], 'notes.txt')).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnsupportedFileTypeError);
    expect(err.message).toBe('Failed to chunk file');
  });
});
