/**
 * Purpose: Tests for community transformer — pass through authorTier, no hardcoded values
 */
import { describe, it, expect } from 'vitest';
import { transformPost, transformReply } from '../community';
import type { PortalPost, PortalReply } from '@/lib/types/backend';

describe('transformPost', () => {
  const raw: PortalPost = {
    id: 'post-1',
    author: 'peer-abc123',
    authorTier: 'Gold',
    title: 'Test post',
    content: 'Hello world',
    tab: 'recent',
    upvotes: 5,
    replies: 3,
    time: '2026-02-16T12:00:00Z',
    tags: ['test'],
    category: 'general',
    viewCount: 42,
  };

  it('passes through authorTier from backend instead of hardcoding', () => {
    const post = transformPost(raw);
    expect(post.authorTier).toBe('Gold');
  });

  it('does not include hardcoded reputation field', () => {
    const post = transformPost(raw);
    expect(post).not.toHaveProperty('reputation');
  });

  it('maps content to body and replies to commentCount', () => {
    const post = transformPost(raw);
    expect(post.body).toBe('Hello world');
    expect(post.commentCount).toBe(3);
    expect(post.timestamp).toBe('2026-02-16T12:00:00Z');
  });
});

describe('transformReply', () => {
  const raw: PortalReply = {
    id: 'reply-1',
    postId: 'post-1',
    author: 'peer-xyz789',
    content: 'Great post',
    time: '2026-02-16T13:00:00Z',
  };

  it('maps content to body and time to timestamp', () => {
    const reply = transformReply(raw);
    expect(reply.body).toBe('Great post');
    expect(reply.timestamp).toBe('2026-02-16T13:00:00Z');
    expect(reply.author).toBe('peer-xyz789');
  });
});

describe('author display names', () => {
  const base: PortalPost = {
    id: 'post-2',
    author: 'peer-abc123',
    authorTier: 'new',
    title: '',
    content: 'x',
    tab: 'recent',
    upvotes: 0,
    replies: 0,
    time: '2026-02-16T12:00:00Z',
    tags: [],
    category: 'general',
    viewCount: 0,
  };

  it('leaves authorDisplayName off when the tracker sends none', () => {
    expect(transformPost(base)).not.toHaveProperty('authorDisplayName');
    expect(transformReply({ id: 'r', postId: 'p', author: 'peer-1', content: 'c', time: 't' })).not.toHaveProperty('authorDisplayName');
  });

  it('reads the flat camelCase and snake_case spellings', () => {
    expect(transformPost({ ...base, authorDisplayName: 'Alice' }).authorDisplayName).toBe('Alice');
    expect(transformPost({ ...base, author_display_name: 'Alice' }).authorDisplayName).toBe('Alice');
    const reply = transformReply({ id: 'r', postId: 'p', author: 'peer-1', author_display_name: 'Bob', content: 'c', time: 't' });
    expect(reply.author).toBe('peer-1');
    expect(reply.authorDisplayName).toBe('Bob');
  });

  it('reads a nested author object', () => {
    const post = transformPost({ ...base, author: { peer_id: 'peer-9', display_name: 'Carol' } });
    expect(post.author).toBe('peer-9');
    expect(post.authorDisplayName).toBe('Carol');
  });
});
