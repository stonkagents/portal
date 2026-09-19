/**
 * Purpose: Tests for reading a peer reference from the tracker's spellings:
 *          flat author + authorDisplayName, nested author object, and the
 *          portal peer list's name-or-masked-id field.
 */
import { describe, it, expect } from 'vitest';
import { portalPeerDisplayName, readAuthorRef, readDisplayName, trackerMaskedPeerId } from '../peer-ref';

const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';

describe('readAuthorRef', () => {
  it('reads a flat author string without a name', () => {
    expect(readAuthorRef({ author: PEER_ID })).toEqual({ peerId: PEER_ID, displayName: undefined });
  });

  it('reads the flat display name in either spelling', () => {
    expect(readAuthorRef({ author: PEER_ID, authorDisplayName: 'Alice' })).toEqual({ peerId: PEER_ID, displayName: 'Alice' });
    expect(readAuthorRef({ author: PEER_ID, author_display_name: 'Bob' })).toEqual({ peerId: PEER_ID, displayName: 'Bob' });
  });

  it('reads a nested author object in either spelling', () => {
    expect(readAuthorRef({ author: { peer_id: PEER_ID, display_name: 'Alice' } })).toEqual({ peerId: PEER_ID, displayName: 'Alice' });
    expect(readAuthorRef({ author: { peerId: PEER_ID, displayName: 'Alice' } })).toEqual({ peerId: PEER_ID, displayName: 'Alice' });
    expect(readAuthorRef({ author: { peer_id: PEER_ID } })).toEqual({ peerId: PEER_ID, displayName: undefined });
  });

  it('ignores blank names', () => {
    expect(readAuthorRef({ author: PEER_ID, authorDisplayName: '   ' }).displayName).toBeUndefined();
    expect(readAuthorRef({ author: { peer_id: PEER_ID, display_name: '' } }).displayName).toBeUndefined();
  });

  it('never throws on a missing author', () => {
    expect(readAuthorRef({ author: undefined })).toEqual({ peerId: '', displayName: undefined });
  });
});

describe('readDisplayName', () => {
  it('reads any spelling, trimmed', () => {
    expect(readDisplayName({ display_name: ' A ' })).toBe('A');
    expect(readDisplayName({ displayName: 'B' })).toBe('B');
    expect(readDisplayName({ peer_display_name: 'C' })).toBe('C');
    expect(readDisplayName({ peerDisplayName: 'D' })).toBe('D');
    expect(readDisplayName({})).toBeUndefined();
    expect(readDisplayName({ display_name: null })).toBeUndefined();
  });
});

describe('trackerMaskedPeerId', () => {
  it('matches the tracker (6...6 for long ids, untouched when short)', () => {
    expect(trackerMaskedPeerId(PEER_ID)).toBe('12D3Ko...6789ab');
    expect(trackerMaskedPeerId('short-id')).toBe('short-id');
  });
});

describe('portalPeerDisplayName', () => {
  it('prefers an explicit display-name field', () => {
    expect(portalPeerDisplayName({ name: 'Alice', peerId: PEER_ID, displayName: 'Alice' })).toBe('Alice');
    expect(portalPeerDisplayName({ name: 'Alice', peerId: PEER_ID, display_name: 'Alice' })).toBe('Alice');
  });

  it('reads an explicit empty display name as none, whatever name says', () => {
    expect(portalPeerDisplayName({ name: '12D3Ko...6789ab', peerId: PEER_ID, displayName: '' })).toBeUndefined();
  });

  it('infers the name from a name that is not the masked id', () => {
    expect(portalPeerDisplayName({ name: 'Alice', peerId: PEER_ID })).toBe('Alice');
    expect(portalPeerDisplayName({ name: '12D3Ko...6789ab', peerId: PEER_ID })).toBeUndefined();
    expect(portalPeerDisplayName({ name: PEER_ID, peerId: PEER_ID })).toBeUndefined();
  });
});
