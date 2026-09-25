/**
 * Purpose: The pack install client reads the body before it judges the status,
 *          so the not-ready answer (503 with a body) is a state and not a
 *          failure; every per item row survives parsing, including a refusal and
 *          a failure in the same answer; and a request level error envelope
 *          becomes an ApiRequestError carrying the daemon's own code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getInstalledPackItems,
  installPackItems,
  parseInstallAnswer,
  parsePackWants,
  removeInstalledPackItem,
  PACKS_INSTALL_URL,
  PACKS_INSTALLED_URL,
  packsRemoveUrl,
} from '../daemon-packs';
import { ApiRequestError } from '../errors';

const fetchMock = vi.fn();

function answer(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const STATE_DIR = {
  dir: 'D:\\home\\.openclaw',
  skills_dir: 'D:\\home\\.openclaw\\skills',
  source: 'home',
  home: 'C:\\Users\\me',
  exists: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installPackItems', () => {
  it('posts the request and keeps one row per requested item', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({
        status: 'ok',
        message: '1 installed, 0 already there, 1 not installed',
        state_dir: STATE_DIR,
        requested: 2,
        installed: 1,
        replaced: 0,
        already_installed: 0,
        refused: 1,
        failed: 0,
        results: [
          {
            id: 'network-basics',
            name: 'network-basics',
            type: 'claw-memory',
            pack: 'starter-pack',
            version: '1.0.0',
            cid: 'bafkrei1',
            status: 'installed',
            message: 'installed network-basics 1.0.0 into skills/network-basics',
            path: 'skills/network-basics',
            files: 2,
            bytes: 7183,
            touches: 'Writes <state>/skills/network-basics/ (2 files).',
            wants: { bins: ['gh'], os: ['darwin'], install_hooks: true },
          },
          {
            id: 'daemon-api',
            status: 'refused',
            code: 'NAME_IN_USE',
            message: 'a skill directory named daemon-api is already there and this agent did not install it',
          },
        ],
      }),
    );

    const result = await installPackItems({ items: ['network-basics', 'daemon-api'] });

    expect(fetchMock).toHaveBeenCalledWith(PACKS_INSTALL_URL, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ items: ['network-basics', 'daemon-api'] });
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('installed');
    expect(result.results[0].wants).toEqual({ bins: ['gh'], os: ['darwin'], installHooks: true });
    expect(result.results[1].status).toBe('refused');
    expect(result.results[1].code).toBe('NAME_IN_USE');
    expect(result.results[1].message).toContain('already there');
    /* The row carries no wants, and the encoder left the empty fields out. */
    expect(result.results[1].wants).toBeNull();
    expect(result.results[1].path).toBe('');
  });

  it('reads the not-ready answer off a 503 body instead of failing', async () => {
    fetchMock.mockResolvedValueOnce(
      answer(
        {
          status: 'not_ready',
          message: 'The command tools are still finishing.',
          state_dir: { ...STATE_DIR, exists: false },
          requested: 4,
          results: [],
        },
        503,
      ),
    );

    const result = await installPackItems({ pack: 'starter-pack' });

    expect(result.status).toBe('not_ready');
    expect(result.message).toContain('command tools');
    expect(result.stateDir.exists).toBe(false);
    expect(result.results).toEqual([]);
  });

  it('turns an error envelope into an ApiRequestError with the daemon code', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({ error: { code: 'NOT_IN_CATALOG', message: 'the catalog does not carry an item called nope' } }, 404),
    );

    await expect(installPackItems({ items: ['nope'] })).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 404,
      code: 'NOT_IN_CATALOG',
      message: 'the catalog does not carry an item called nope',
    });
  });

  it('names the agent when the request never got an answer', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(installPackItems({ pack: 'starter-pack' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: "Can't reach your agent.",
    });
  });

  it('sends replace when a different version is installed', async () => {
    fetchMock.mockResolvedValueOnce(answer({ status: 'ok', state_dir: STATE_DIR, results: [] }));
    await installPackItems({ items: ['network-basics'], replace: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ items: ['network-basics'], replace: true });
  });
});

describe('getInstalledPackItems', () => {
  it('reads the installed index', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({
        status: 'ok',
        state_dir: STATE_DIR,
        items: [
          {
            id: 'network-basics',
            name: 'network-basics',
            type: 'claw-memory',
            pack: 'starter-pack',
            version: '1.0.0',
            title: 'How the network works',
            description: 'Peers, the tracker, CIDs.',
            cid: 'bafkrei1',
            sha256: '856eec',
            installed_at: '2026-09-23T09:03:43Z',
            paths: ['skills/network-basics/SKILL.md', 'skills/network-basics/reference/glossary.md'],
            wants: { install_hooks: false },
          },
        ],
      }),
    );

    const result = await getInstalledPackItems();

    expect(fetchMock).toHaveBeenCalledWith(PACKS_INSTALLED_URL, expect.objectContaining({ method: 'GET' }));
    expect(result.status).toBe('ok');
    expect(result.items[0].paths).toHaveLength(2);
    expect(result.items[0].installedAt).toBe('2026-09-23T09:03:43Z');
    expect(result.items[0].wants).toEqual({ bins: [], os: [], installHooks: false });
    expect(result.stateDir.skillsDir).toBe(STATE_DIR.skills_dir);
  });

  it('reads an empty list, and the not-ready listing that answers 200', async () => {
    fetchMock.mockResolvedValueOnce(answer({ status: 'ok', state_dir: STATE_DIR, items: [] }));
    await expect(getInstalledPackItems()).resolves.toMatchObject({ status: 'ok', items: [] });

    fetchMock.mockResolvedValueOnce(answer({ status: 'not_ready', state_dir: { ...STATE_DIR, exists: false }, items: [] }));
    await expect(getInstalledPackItems()).resolves.toMatchObject({ status: 'not_ready', items: [] });
  });
});

describe('removeInstalledPackItem', () => {
  it('deletes by item id and reports what went', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({
        status: 'removed',
        message: 'removed network-basics and the 2 files it installed',
        state_dir: STATE_DIR,
        item: { id: 'network-basics', name: 'network-basics', paths: ['skills/network-basics/SKILL.md'] },
      }),
    );

    const result = await removeInstalledPackItem('network-basics');

    expect(fetchMock).toHaveBeenCalledWith(packsRemoveUrl('network-basics'), expect.objectContaining({ method: 'DELETE' }));
    expect(result.status).toBe('removed');
    expect(result.message).toContain('2 files');
    expect(result.item?.id).toBe('network-basics');
  });

  it('reports an id this agent never installed', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({ error: { code: 'NOT_INSTALLED', message: 'this agent has no record of installing network-basics' } }, 404),
    );

    await expect(removeInstalledPackItem('network-basics')).rejects.toMatchObject({ status: 404, code: 'NOT_INSTALLED' });
  });
});

describe('parsing', () => {
  it('reads an unknown per item status as failed rather than as a success', () => {
    const parsed = parseInstallAnswer({
      status: 'ok',
      state_dir: {},
      results: [{ id: 'x', status: 'exploded', message: 'what' }],
    });
    expect(parsed?.results[0].status).toBe('failed');
  });

  it('returns null for a body that is not an answer, so the caller raises the envelope', () => {
    expect(parseInstallAnswer({ error: { code: 'INVALID_REQUEST' } })).toBeNull();
    expect(parseInstallAnswer(null)).toBeNull();
  });

  it('keeps an absent wants absent', () => {
    expect(parsePackWants(undefined)).toBeNull();
    expect(parsePackWants({ install_hooks: false })).toEqual({ bins: [], os: [], installHooks: false });
  });

  it('raises a readable error when the answer is not JSON at all', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(getInstalledPackItems()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
