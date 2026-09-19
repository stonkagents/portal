// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import type { LaunchPreflightError } from './errors';
import { LAUNCH_CONFIG, STONK_QUOTE, USDC_QUOTE } from './__fixtures__/launch-config';
import { LAUNCH_COMPUTE_UNITS } from './constants';
import type { PrepareLaunchParams } from './build-launch';
import type * as Web3Module from '@solana/web3.js';

/**
 * A stand-in for the Raydium SDK. `createLaunchpad` records what it was asked
 * for and returns one versioned transaction with a single memo-like instruction,
 * which is enough to check that we append the fee transfer and sign with the mint.
 */
const createLaunchpad = vi.fn();
const decodeConfig = vi.fn((_data: Uint8Array) => ({ decoded: true }));
const loadRaydium = vi.fn();

vi.mock('@raydium-io/raydium-sdk-v2', () => ({
  LaunchpadConfig: { decode: (data: Uint8Array) => decodeConfig(data) },
  Raydium: { load: (...args: unknown[]) => loadRaydium(...args) },
  TxVersion: { V0: 0, LEGACY: 1 },
}));

const CREATOR = Keypair.generate();
const TREASURY = new PublicKey(LAUNCH_CONFIG.treasury);
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

const getAccountInfo = vi.fn(async () => ({ data: new Uint8Array(8), owner: PublicKey.default }));
const getLatestBlockhash = vi.fn(async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1234 }));
const getAddressLookupTable = vi.fn();
const sendRawTransaction = vi.fn(async (_raw: Uint8Array, _opts?: { skipPreflight?: boolean }) => 'sig123');
const confirmTransaction = vi.fn(async (..._args: unknown[]) => ({ value: { err: null } }));
const getSignatureStatus = vi.fn(async (_sig: string) => ({ value: { confirmationStatus: 'confirmed' } }));
const simulateTransaction = vi.fn(async (_tx: VersionedTransaction, _opts?: unknown) => ({
  context: { slot: 1 },
  value: { err: null as unknown, logs: [] as string[], unitsConsumed: 1 },
}));

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof Web3Module>('@solana/web3.js');
  class FakeConnection {
    getAccountInfo = getAccountInfo;
    getLatestBlockhash = getLatestBlockhash;
    getAddressLookupTable = getAddressLookupTable;
    sendRawTransaction = sendRawTransaction;
    confirmTransaction = confirmTransaction;
    getSignatureStatus = getSignatureStatus;
    simulateTransaction = simulateTransaction;
  }
  return { ...actual, Connection: FakeConnection };
});

const params: PrepareLaunchParams = {
  launchConfig: LAUNCH_CONFIG,
  quote: STONK_QUOTE,
  name: 'Signal Hound',
  symbol: 'HOUND',
  uri: 'https://gateway.example/ipfs/meta',
  creatorWallet: CREATOR.publicKey.toBase58(),
};

/**
 * What the SDK might emit: one instruction from the payer, plus one per extra
 * signer so the mint is a signer account of the message, as it is in the real
 * create instruction.
 */
function sdkTransaction(payer: PublicKey, signers: PublicKey[] = []): VersionedTransaction {
  const sink = Keypair.generate().publicKey;
  const instructions = [payer, ...signers].map(from => SystemProgram.transfer({ fromPubkey: from, toPubkey: sink, lamports: 1 }));
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions }).compileToV0Message();
  return new VersionedTransaction(message);
}

async function loadWithRealWallet(real: boolean) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_USE_REAL_WALLET', real ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_SOLANA_RPC_URL', 'https://rpc.example');
  return import('./build-launch');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('prepareLaunch on the mock path', () => {
  it('runs without a chain', async () => {
    const { isMockLaunch } = await loadWithRealWallet(false);
    expect(isMockLaunch()).toBe(true);
  });

  it('returns a signable-looking result with no transaction', async () => {
    const { prepareLaunch } = await loadWithRealWallet(false);
    const result = await prepareLaunch(params);
    expect(result.transaction).toBeNull();
    expect(result.summary.mock).toBe(true);
    expect(result.mint).toHaveLength(44);
    expect(result.poolId).toHaveLength(44);
    expect(result.mint).not.toBe(result.poolId);
    expect(result.mintKeypair.publicKey.toBase58()).toBe(result.mint);
    expect(createLaunchpad).not.toHaveBeenCalled();
  });

  it('is deterministic for the same token and differs for another', async () => {
    const { prepareLaunch } = await loadWithRealWallet(false);
    const a = await prepareLaunch(params);
    const b = await prepareLaunch(params);
    const c = await prepareLaunch({ ...params, symbol: 'OTHER' });
    expect(b.mint).toBe(a.mint);
    expect(b.poolId).toBe(a.poolId);
    expect(c.mint).not.toBe(a.mint);
  });

  it('summarises the launch from the tracker config, not the environment', async () => {
    const { prepareLaunch } = await loadWithRealWallet(false);
    const { summary } = await prepareLaunch({ ...params, devBuyQuoteAmount: 1_000 });
    expect(summary).toMatchObject({
      name: 'Signal Hound',
      symbol: 'HOUND',
      quoteMint: STONK_QUOTE.quoteMint,
      quoteSymbol: 'STONK',
      metadataUri: params.uri,
      holderTaxBps: 100,
      devBuyQuoteAmount: 1_000,
      graduationQuoteAmount: LAUNCH_CONFIG.raise.units,
      graduationQuoteRaw: LAUNCH_CONFIG.raise.raw,
      launchFeeLamports: 4_901_732,
      treasury: LAUNCH_CONFIG.treasury,
      platformId: LAUNCH_CONFIG.platformId,
      programId: LAUNCH_CONFIG.programId,
      configId: STONK_QUOTE.launchlabConfigId,
      createOnly: false,
      computeUnits: LAUNCH_COMPUTE_UNITS,
    });
    expect(summary.launchFeeSol).toBeCloseTo(0.004901732, 9);
  });

  it('launches create-only when there is no dev buy', async () => {
    const { prepareLaunch } = await loadWithRealWallet(false);
    const { summary } = await prepareLaunch(params);
    expect(summary.createOnly).toBe(true);
    expect(summary.devBuyQuoteAmount).toBe(0);
  });
});

describe('prepareLaunch against the SDK', () => {
  beforeEach(() => {
    loadRaydium.mockImplementation(async () => ({
      api: {},
      launchpad: {
        createLaunchpad: async (args: Record<string, unknown>) => {
          createLaunchpad(args);
          const extraSigners = args.extraSigners as Keypair[];
          return {
            transactions: [
              sdkTransaction(
                args.feePayer as PublicKey,
                extraSigners.map(k => k.publicKey),
              ),
            ],
            signers: [extraSigners],
            extInfo: { address: { poolId: Keypair.generate().publicKey } },
          };
        },
      },
    }));
  });

  it('passes every chain value from the launch config and appends the fee transfer', async () => {
    const { prepareLaunch } = await loadWithRealWallet(true);
    const prepared = await prepareLaunch({ ...params, devBuyQuoteAmount: 12.5 });

    expect(decodeConfig).toHaveBeenCalledTimes(1);
    expect(createLaunchpad).toHaveBeenCalledTimes(1);
    const args = createLaunchpad.mock.calls[0][0] as Record<string, unknown>;

    expect((args.programId as PublicKey).toBase58()).toBe(LAUNCH_CONFIG.programId);
    expect((args.platformId as PublicKey).toBase58()).toBe(LAUNCH_CONFIG.platformId);
    expect((args.configId as PublicKey).toBase58()).toBe(STONK_QUOTE.launchlabConfigId);
    expect((args.mintBProgram as PublicKey).toBase58()).toBe(STONK_QUOTE.tokenProgram);
    expect(args.decimals).toBe(6);
    expect(args.mintBDecimals).toBe(9);
    expect(args.migrateType).toBe('cpmm');
    expect(String(args.supply)).toBe(LAUNCH_CONFIG.curve.supply);
    expect(String(args.totalSellA)).toBe(LAUNCH_CONFIG.curve.totalSellA);
    expect(String(args.totalFundRaisingB)).toBe(LAUNCH_CONFIG.raise.raw);
    expect(String(args.buyAmount)).toBe('12500000000');
    expect(args.createOnly).toBe(false);
    expect(args.name).toBe('Signal Hound');
    expect(args.symbol).toBe('HOUND');
    expect(args.uri).toBe(params.uri);
    expect((args.transferFeeExtensionParams as { transferFeeBasePoints: number }).transferFeeBasePoints).toBe(100);
    expect((args.extraSigners as Keypair[])[0].publicKey.toBase58()).toBe(prepared.mint);
    expect(args.txVersion).toBe(0);

    const tx = prepared.transaction as VersionedTransaction;
    expect(tx).toBeInstanceOf(VersionedTransaction);
    const message = TransactionMessage.decompile(tx.message);
    const last = message.instructions[message.instructions.length - 1];
    expect(last.programId.equals(SystemProgram.programId)).toBe(true);
    expect(last.keys[1].pubkey.equals(TREASURY)).toBe(true);
    const lamports = Number(new DataView(last.data.buffer, last.data.byteOffset + 4, 8).getBigUint64(0, true));
    expect(lamports).toBe(LAUNCH_CONFIG.fee.lamports);

    expect(prepared.blockhash).toBe(BLOCKHASH);
    expect(prepared.lastValidBlockHeight).toBe(1234);
    expect(prepared.summary.mock).toBe(false);
    // Mint signed; the wallet signs last.
    const mintIndex = tx.message.staticAccountKeys.findIndex(k => k.toBase58() === prepared.mint);
    expect(tx.signatures[mintIndex].some(b => b !== 0)).toBe(true);
  });

  it('uses the picked quote for the config id, decimals and token program', async () => {
    const { prepareLaunch } = await loadWithRealWallet(true);
    await prepareLaunch({ ...params, quote: USDC_QUOTE });
    const args = createLaunchpad.mock.calls[0][0] as Record<string, unknown>;
    expect((args.configId as PublicKey).toBase58()).toBe(USDC_QUOTE.launchlabConfigId);
    expect(args.mintBDecimals).toBe(6);
    expect(args.createOnly).toBe(true);
  });

  it('refuses when the quote config is not on this cluster', async () => {
    getAccountInfo.mockResolvedValueOnce(null as never);
    const { prepareLaunch } = await loadWithRealWallet(true);
    await expect(prepareLaunch(params)).rejects.toThrow(/Quote config not found for STONK/);
  });

  it('refuses a launch that would need more than one transaction', async () => {
    loadRaydium.mockImplementationOnce(async () => ({
      api: {},
      launchpad: {
        createLaunchpad: async (args: Record<string, unknown>) => ({
          transactions: [sdkTransaction(args.feePayer as PublicKey), sdkTransaction(args.feePayer as PublicKey)],
          signers: [[], []],
          extInfo: { address: { poolId: Keypair.generate().publicKey } },
        }),
      },
    }));
    const { prepareLaunch } = await loadWithRealWallet(true);
    await expect(prepareLaunch(params)).rejects.toThrow(/needs 2 transactions/);
  });
});

describe('prepareLaunch preflight', () => {
  beforeEach(() => {
    loadRaydium.mockImplementation(async () => ({
      api: {},
      launchpad: {
        createLaunchpad: async (args: Record<string, unknown>) => {
          const extraSigners = args.extraSigners as Keypair[];
          return {
            transactions: [
              sdkTransaction(
                args.feePayer as PublicKey,
                extraSigners.map(k => k.publicKey),
              ),
            ],
            signers: [extraSigners],
            extInfo: { address: { poolId: Keypair.generate().publicKey } },
          };
        },
      },
    }));
  });

  it('simulates without signature checks before the wallet is asked, and passes on success', async () => {
    const { prepareLaunch } = await loadWithRealWallet(true);
    const prepared = await prepareLaunch(params);
    expect(simulateTransaction).toHaveBeenCalledTimes(1);
    const [tx, opts] = simulateTransaction.mock.calls[0];
    expect(tx).toBe(prepared.transaction);
    expect(opts).toEqual({ sigVerify: false, replaceRecentBlockhash: true });
  });

  it('refuses a launch the node says would fail, quoting the error and the last three log lines', async () => {
    simulateTransaction.mockResolvedValueOnce({
      context: { slot: 1 },
      value: {
        err: { InstructionError: [3, { Custom: 6001 }] },
        logs: ['Program log: one', 'Program log: two', 'Program log: three', 'Program log: Error: NotEnoughQuote', 'Program X failed'],
        unitsConsumed: 1,
      },
    });
    const { prepareLaunch } = await loadWithRealWallet(true);
    const failure = await prepareLaunch(params).catch((err: unknown) => err);
    // The module registry is reset per load, so match by name rather than identity.
    expect((failure as Error).name).toBe('LaunchPreflightError');
    expect((failure as LaunchPreflightError).kind).toBe('simulation');
    expect((failure as Error).message).toBe(
      'The launch would fail on-chain: {"InstructionError":[3,{"Custom":6001}]}. Program log: three · Program log: Error: NotEnoughQuote · Program X failed',
    );
  });

  it('does not block on a node that cannot simulate', async () => {
    simulateTransaction.mockRejectedValueOnce(new Error('rpc down'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { prepareLaunch } = await loadWithRealWallet(true);
    await expect(prepareLaunch(params)).resolves.toBeDefined();
  });

  it('refuses a transaction over the 1232-byte packet limit before simulating', async () => {
    const { preflightLaunch } = await loadWithRealWallet(true);
    const web3 = await import('@solana/web3.js');
    // A message that still encodes on its own but, with two signatures in front, tops the packet.
    const second = Keypair.generate();
    const sinks = Array.from({ length: 21 }, () => Keypair.generate().publicKey);
    const instructions = [
      SystemProgram.transfer({ fromPubkey: second.publicKey, toPubkey: sinks[0], lamports: 1 }),
      ...sinks.map(to => SystemProgram.transfer({ fromPubkey: CREATOR.publicKey, toPubkey: to, lamports: 1 })),
    ];
    const message = new TransactionMessage({
      payerKey: CREATOR.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions,
    }).compileToV0Message();
    const big = new VersionedTransaction(message);
    expect(1 + 64 * 2 + message.serialize().length).toBeGreaterThan(1232);

    const failure = await preflightLaunch(big, new web3.Connection('https://rpc.example')).catch((err: unknown) => err);
    expect((failure as Error).name).toBe('LaunchPreflightError');
    expect((failure as LaunchPreflightError).kind).toBe('size');
    expect((failure as Error).message).toMatch(/^The launch transaction is (\d+ bytes|too large), over Solana's 1232-byte limit\./);
    expect(simulateTransaction).not.toHaveBeenCalled();
  });
});

describe('prepareLaunch recompiles the SDK message faithfully', () => {
  it('inlines the looked-up accounts when the transaction fits, orders the signers payer then mint, and leaves the payer slot for the wallet', async () => {
    // An SDK transaction that reads one account through an address lookup table.
    const lookedUp = Keypair.generate().publicKey;
    const altKey = Keypair.generate().publicKey;
    const alt = new AddressLookupTableAccount({
      key: altKey,
      state: {
        deactivationSlot: BigInt('18446744073709551615'),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: undefined,
        addresses: [lookedUp],
      },
    });
    getAddressLookupTable.mockResolvedValueOnce({ context: { slot: 1 }, value: alt });

    loadRaydium.mockImplementationOnce(async () => ({
      api: {},
      launchpad: {
        createLaunchpad: async (args: Record<string, unknown>) => {
          const payer = args.feePayer as PublicKey;
          const mint = (args.extraSigners as Keypair[])[0].publicKey;
          const instructions = [
            SystemProgram.transfer({ fromPubkey: payer, toPubkey: lookedUp, lamports: 1 }),
            SystemProgram.transfer({ fromPubkey: mint, toPubkey: lookedUp, lamports: 1 }),
          ];
          const message = new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions }).compileToV0Message([
            alt,
          ]);
          return {
            transactions: [new VersionedTransaction(message)],
            signers: [args.extraSigners],
            extInfo: { address: { poolId: Keypair.generate().publicKey } },
          };
        },
      },
    }));

    const { prepareLaunch } = await loadWithRealWallet(true);
    const prepared = await prepareLaunch(params);
    const tx = prepared.transaction as VersionedTransaction;
    const { message } = tx;

    // A launch this small fits without the table, so the looked-up account is inlined: wallets that
    // sign on a server (Phantom's seedless kind) cannot resolve lookup tables and refuse them.
    expect(message.addressTableLookups).toHaveLength(0);
    expect(message.staticAccountKeys.some(k => k.equals(lookedUp))).toBe(true);
    void altKey;

    // Signers: the wallet (payer) first, the mint second, nothing else.
    expect(message.header.numRequiredSignatures).toBe(2);
    expect(message.staticAccountKeys[0].equals(CREATOR.publicKey)).toBe(true);
    expect(message.staticAccountKeys[1].toBase58()).toBe(prepared.mint);

    // The mint has signed; the payer slot is still empty for Phantom to fill.
    expect(tx.signatures).toHaveLength(2);
    expect(tx.signatures[0].every(b => b === 0)).toBe(true);
    expect(tx.signatures[1].some(b => b !== 0)).toBe(true);

    // The SDK's instructions come first, our fee transfer last, and every original key survived.
    const decompiled = TransactionMessage.decompile(message, { addressLookupTableAccounts: [alt] });
    expect(decompiled.instructions).toHaveLength(3);
    expect(decompiled.instructions[2].keys[1].pubkey.equals(TREASURY)).toBe(true);
    const keys = message.getAccountKeys({ addressLookupTableAccounts: [alt] });
    for (const expected of [CREATOR.publicKey, new PublicKey(prepared.mint), lookedUp, TREASURY, SystemProgram.programId]) {
      expect(
        keys
          .keySegments()
          .flat()
          .some(k => k.equals(expected)),
      ).toBe(true);
    }
  });
});

describe('sendAndConfirm', () => {
  it('sends without preflight and confirms against the blockhash it was built on', async () => {
    const { sendAndConfirm } = await loadWithRealWallet(true);
    const tx = sdkTransaction(CREATOR.publicKey);
    tx.sign([CREATOR]);
    const signature = await sendAndConfirm(tx, { blockhash: BLOCKHASH, lastValidBlockHeight: 1234 });
    expect(signature).toBe('sig123');
    expect(sendRawTransaction.mock.calls[0][1]).toEqual({ skipPreflight: true });
    expect(confirmTransaction).toHaveBeenCalledWith(
      { signature: 'sig123', blockhash: BLOCKHASH, lastValidBlockHeight: 1234 },
      'confirmed',
    );
  });

  it('asks the network directly when confirmation times out', async () => {
    confirmTransaction.mockRejectedValueOnce(new Error('timeout'));
    const { sendAndConfirm } = await loadWithRealWallet(true);
    const tx = sdkTransaction(CREATOR.publicKey);
    tx.sign([CREATOR]);
    await expect(sendAndConfirm(tx)).resolves.toBe('sig123');
    expect(getSignatureStatus).toHaveBeenCalledWith('sig123');
  });

  it('splits into a send and a confirm, so a signature the wallet broadcast can be waited on alone', async () => {
    const { sendSigned, confirmSignature } = await loadWithRealWallet(true);
    const tx = sdkTransaction(CREATOR.publicKey);
    tx.sign([CREATOR]);
    await expect(sendSigned(tx)).resolves.toBe('sig123');
    expect(confirmTransaction).not.toHaveBeenCalled();

    await expect(confirmSignature('walletSig', { blockhash: BLOCKHASH, lastValidBlockHeight: 1234 })).resolves.toBeUndefined();
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).toHaveBeenCalledWith({ signature: 'walletSig', blockhash: BLOCKHASH, lastValidBlockHeight: 1234 }, 'confirmed');
  });
});

describe('explorerUrl', () => {
  it('points at the configured explorer and cluster', async () => {
    const { explorerUrl } = await loadWithRealWallet(false);
    const url = explorerUrl('tx', 'sig123');
    expect(url).toContain('/tx/sig123');
    expect(url.startsWith('http')).toBe(true);
  });
});
