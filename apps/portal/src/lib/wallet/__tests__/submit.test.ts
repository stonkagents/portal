/**
 * submitViaWallet: the wallet signs and sends; a wallet that cannot send falls
 * back to sign-only plus our own send; a rejection is final either way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitViaWallet } from '../submit';

const tx = { kind: 'tx' } as never;
const signed = { kind: 'signed' } as never;

function fakeWallet() {
  return {
    signAndSend: vi.fn(async () => ({ signature: 'SIG-WALLET' })),
    sign: vi.fn(async () => signed),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('submitViaWallet', () => {
  it('returns the signature the wallet sent with, without signing twice or sending itself', async () => {
    const wallet = fakeWallet();
    const sendSigned = vi.fn(async () => 'SIG-RPC');
    await expect(submitViaWallet(wallet, tx, sendSigned)).resolves.toBe('SIG-WALLET');
    expect(wallet.signAndSend).toHaveBeenCalledWith(tx);
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(sendSigned).not.toHaveBeenCalled();
  });

  it('falls back to sign-only and our own send when the wallet cannot send', async () => {
    const wallet = fakeWallet();
    wallet.signAndSend.mockRejectedValueOnce(new Error('Feature not supported: sending transactions'));
    const sendSigned = vi.fn(async () => 'SIG-RPC');
    await expect(submitViaWallet(wallet, tx, sendSigned)).resolves.toBe('SIG-RPC');
    expect(wallet.sign).toHaveBeenCalledWith(tx);
    expect(sendSigned).toHaveBeenCalledWith(signed);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('never asks the wallet again after the user rejected, by code or by message, even when wrapped', async () => {
    const sendSigned = vi.fn(async () => 'SIG-RPC');
    const wrapped = new Error('Failed to send transaction') as Error & { originalError: unknown };
    wrapped.originalError = { code: 4001, message: 'User rejected the request.' };
    for (const rejection of [{ code: 4001, message: 'User rejected the request.' }, new Error('User rejected the request'), wrapped]) {
      const wallet = fakeWallet();
      wallet.signAndSend.mockRejectedValueOnce(rejection);
      await expect(submitViaWallet(wallet, tx, sendSigned)).rejects.toBe(rejection);
      expect(wallet.sign).not.toHaveBeenCalled();
    }
    expect(sendSigned).not.toHaveBeenCalled();
  });

  it('surfaces a failure of the fallback send as is', async () => {
    const wallet = fakeWallet();
    wallet.signAndSend.mockRejectedValueOnce(new Error('Failed to send transaction'));
    const sendSigned = vi.fn(async () => {
      throw new Error('Blockhash not found');
    });
    await expect(submitViaWallet(wallet, tx, sendSigned)).rejects.toThrow('Blockhash not found');
  });
});
