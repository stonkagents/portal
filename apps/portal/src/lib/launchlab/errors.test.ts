import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVNET_WALLET_HINT, LaunchPreflightError, classifyLaunchError, deepestErrorMessage, errorChain, isUserRejection, logErrorChain } from './errors';

/** What @solana/connector throws: a wrapper whose `originalError` is the wallet's own error. */
function connectorSigningFailed(inner: unknown) {
  const wrapper = new Error('Failed to sign transaction') as Error & { code: string; originalError: unknown };
  wrapper.name = 'TransactionError';
  wrapper.code = 'SIGNING_FAILED';
  wrapper.originalError = inner;
  return wrapper;
}

afterEach(() => vi.restoreAllMocks());

describe('errorChain / deepestErrorMessage', () => {
  it('walks cause, originalError and details without looping', () => {
    const root = new Error('Transaction simulation failed: blockhash not found');
    const mid = new Error('Both array and singular formats failed', { cause: root });
    const top = connectorSigningFailed(mid);
    (root as Error & { cause?: unknown }).cause = top; // a loop, on purpose

    expect(errorChain(top)).toEqual([top, mid, root]);
    expect(deepestErrorMessage(top)).toBe('Transaction simulation failed: blockhash not found');
  });

  it('reads string and plain-object layers too', () => {
    const err = { message: 'outer', details: { message: 'inner detail' } };
    expect(deepestErrorMessage(err)).toBe('inner detail');
    expect(deepestErrorMessage(new Error('only'))).toBe('only');
    expect(deepestErrorMessage(null)).toBeNull();
  });

  it('logs the whole chain once', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = connectorSigningFailed(new Error('Phantom: no account'));
    logErrorChain('launch', err);
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0];
    expect(args[0]).toBe('[launch]');
    expect(args).toContain(err);
    expect(args).toContain(err.originalError);
  });
});

describe('classifyLaunchError', () => {
  it("surfaces the wallet's own message instead of the connector wrapper", () => {
    const err = connectorSigningFailed(new Error('Phantom: transaction was not confirmed by the network'));
    expect(classifyLaunchError(err, 'signing', 'mainnet')).toBe('Phantom could not sign: Phantom: transaction was not confirmed by the network');
  });

  it('falls back to a generic signing sentence when the wrapper is all there is', () => {
    expect(classifyLaunchError(new Error('Failed to sign transaction'), 'signing')).toMatch(
      /^Phantom could not sign the transaction\./,
    );
  });

  it('finds a wallet error code or a rejection anywhere in the chain', () => {
    const rejected = connectorSigningFailed(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
    expect(classifyLaunchError(rejected, 'signing')).toBe('You rejected the transaction in your wallet.');
    expect(isUserRejection(connectorSigningFailed({ code: 'USER_REJECTED', message: 'nope' }))).toBe(true);
    expect(classifyLaunchError(connectorSigningFailed(Object.assign(new Error('x'), { code: -32603 })), undefined, 'mainnet')).toBe(
      'Something broke inside your wallet. Reopen the extension and try again.',
    );
  });

  it('tells devnet testers to switch Phantom to Testnet Mode when the wallet fails after confirming', () => {
    const internal = connectorSigningFailed(Object.assign(new Error('Unexpected error'), { code: -32603 }));
    expect(classifyLaunchError(internal, 'signing', 'devnet')).toBe(`Something broke inside your wallet. Reopen the extension and try again. ${DEVNET_WALLET_HINT}`);
    expect(classifyLaunchError(new Error('Failed to sign transaction'), 'signing', 'devnet')).toMatch(/Testnet Mode/);
    expect(classifyLaunchError(new Error('Failed to sign transaction'), 'signing', 'mainnet')).not.toMatch(/Testnet Mode/);
    /* A rejection is never blamed on the network. */
    const rejected = connectorSigningFailed(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
    expect(classifyLaunchError(rejected, 'signing', 'devnet')).toBe('You rejected the transaction in your wallet.');
  });

  it('keeps the known classifications for RPC failures found deep in the chain', () => {
    expect(
      classifyLaunchError(
        connectorSigningFailed(new Error('Attempt to debit an account but found no record of a prior credit. insufficient funds')),
      ),
    ).toMatch(/Not enough SOL/);
    expect(classifyLaunchError(new Error('Blockhash not found'))).toMatch(/expired/);
    expect(classifyLaunchError(new Error('Quote config not found for STONK on devnet'))).toMatch(/no launch config/);
  });

  it('passes a preflight error through verbatim', () => {
    const err = new LaunchPreflightError(
      'The launch would fail on-chain: {"InstructionError":[3,"Custom"]}. Program log: x',
      'simulation',
    );
    expect(classifyLaunchError(err, 'signing')).toBe(err.message);
  });

  it('still has a sentence for a non-error throw', () => {
    expect(classifyLaunchError(42)).toBe('The launch failed. Try again.');
  });

  it('tells a server-signed Phantom account what to change when the launch needs lookup tables', () => {
    const err = connectorSigningFailed(new Error('Loaded accounts are not provided, but lookup table is used'));
    const sentence = classifyLaunchError(err, 'signing');
    expect(sentence).toContain('Lower the dev buy');
    expect(sentence).toContain('seed phrase');
    expect(sentence).not.toContain('Loaded accounts');
  });

  it('names the launchpad, not Solana, when the metadata upload never reached the tracker', () => {
    expect(classifyLaunchError(new TypeError('Failed to fetch'), 'uploading')).toBe(
      'Could not reach the launchpad to store the image and metadata. Check your connection and try again.',
    );
    const timedOut = new Error('The tracker did not answer in 60 seconds while trying to store the token metadata. Try again.');
    expect(classifyLaunchError(timedOut, 'uploading')).toBe(
      'The launchpad could not store the image and metadata: The tracker did not answer in 60 seconds while trying to store the token metadata. Try again.',
    );
    /* The same transport failure while confirming is still the chain. */
    expect(classifyLaunchError(new TypeError('Failed to fetch'), 'confirming')).toBe('Could not reach Solana. Check your connection and try again.');
  });
});
