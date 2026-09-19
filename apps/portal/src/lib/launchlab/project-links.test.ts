import { describe, expect, it } from 'vitest';
import { normalizeProjectLink, projectLinkProblem } from './project-links';

describe('normalizeProjectLink', () => {
  it('accepts an empty field for every platform', () => {
    for (const platform of ['website', 'x', 'telegram'] as const) {
      expect(normalizeProjectLink(platform, '')).toEqual({ ok: true, url: '', handle: null, changed: false });
      expect(normalizeProjectLink(platform, '   ')).toMatchObject({ ok: true, url: '' });
    }
  });

  describe('website', () => {
    it('adds https and strips a trailing slash', () => {
      expect(normalizeProjectLink('website', 'stonkagents.com/')).toMatchObject({
        ok: true,
        url: 'https://stonkagents.com',
        changed: true,
      });
      expect(normalizeProjectLink('website', 'https://stonkagents.com/docs')).toMatchObject({
        ok: true,
        url: 'https://stonkagents.com/docs',
        changed: false,
      });
    });
    it('rejects non-addresses and spaces', () => {
      expect(normalizeProjectLink('website', 'my project')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('website', 'localhost')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('website', 'ftp://files.example.com')).toMatchObject({ ok: false });
    });
    it('sends X and Telegram links to their own fields', () => {
      expect(normalizeProjectLink('website', 'https://x.com/stonkagents')).toMatchObject({
        ok: false,
        reason: expect.stringContaining('X field'),
      });
      expect(normalizeProjectLink('website', 't.me/stonkagents')).toMatchObject({
        ok: false,
        reason: expect.stringContaining('Telegram field'),
      });
    });
  });

  describe('x', () => {
    it('forms the link from a handle, with or without @', () => {
      expect(normalizeProjectLink('x', '@StonkAgents')).toMatchObject({
        ok: true,
        url: 'https://x.com/StonkAgents',
        handle: 'StonkAgents',
        changed: true,
      });
      expect(normalizeProjectLink('x', 'stonkagents')).toMatchObject({ ok: true, url: 'https://x.com/stonkagents' });
    });
    it('accepts x.com and twitter.com links and canonicalises them', () => {
      expect(normalizeProjectLink('x', 'https://twitter.com/stonkagents?s=21')).toMatchObject({
        ok: true,
        url: 'https://x.com/stonkagents',
        changed: true,
      });
      expect(normalizeProjectLink('x', 'x.com/stonkagents/')).toMatchObject({ ok: true, url: 'https://x.com/stonkagents' });
      expect(normalizeProjectLink('x', 'https://x.com/stonkagents')).toMatchObject({ ok: true, changed: false });
    });
    it('rejects bad handles, other hosts and X pages', () => {
      expect(normalizeProjectLink('x', 'this_handle_is_too_long_for_x')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('x', 'stonk agents')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('x', 'https://instagram.com/stonkagents')).toMatchObject({
        ok: false,
        reason: 'X links live on x.com',
      });
      expect(normalizeProjectLink('x', 'https://x.com/home')).toMatchObject({
        ok: false,
        reason: 'That is an X page, not an account',
      });
      expect(normalizeProjectLink('x', 'https://x.com/')).toMatchObject({ ok: false });
    });
  });

  describe('telegram', () => {
    it('forms the link from a username, with or without @', () => {
      expect(normalizeProjectLink('telegram', '@stonkagents')).toMatchObject({
        ok: true,
        url: 'https://t.me/stonkagents',
        handle: 'stonkagents',
      });
      expect(normalizeProjectLink('telegram', 'stonk_agents')).toMatchObject({ ok: true, url: 'https://t.me/stonk_agents' });
    });
    it('accepts t.me and telegram.me links, including invite links', () => {
      expect(normalizeProjectLink('telegram', 'telegram.me/stonkagents')).toMatchObject({ ok: true, url: 'https://t.me/stonkagents' });
      expect(normalizeProjectLink('telegram', 'https://t.me/+AbCdEf123')).toMatchObject({
        ok: true,
        url: 'https://t.me/+AbCdEf123',
        handle: null,
      });
      expect(normalizeProjectLink('telegram', 'https://t.me/joinchat/AbCdEf123')).toMatchObject({
        ok: true,
        url: 'https://t.me/joinchat/AbCdEf123',
      });
    });
    it('rejects short, badly formed or wrong-host names', () => {
      expect(normalizeProjectLink('telegram', 'abc')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('telegram', '1stonk')).toMatchObject({ ok: false });
      expect(normalizeProjectLink('telegram', 'https://discord.gg/stonk')).toMatchObject({
        ok: false,
        reason: 'Telegram links live on t.me',
      });
    });
  });

  it('projectLinkProblem returns the reason or null', () => {
    expect(projectLinkProblem('x', '@stonkagents')).toBeNull();
    expect(projectLinkProblem('x', 'https://x.com/home')).toBe('That is an X page, not an account');
  });
});
