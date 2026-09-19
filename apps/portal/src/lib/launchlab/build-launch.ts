/**
 * Build the one transaction that creates an Agent token.
 *
 * One signature does all of it: Raydium LaunchLab creates the Token-2022 base
 * mint with our holder transfer tax, opens the bonding curve against the chosen
 * quote, optionally lands the creator's first buy, and pays our launch fee to
 * the treasury. The mint keypair signs first; the wallet signs last.
 *
 * Every chain value comes from the `LaunchConfig` the tracker served — program,
 * platform, treasury, fee lamports, transfer fee, quote config id, raise and
 * curve. Nothing is read from the environment here. When
 * `NEXT_PUBLIC_USE_REAL_WALLET` is not 'true' this returns a deterministic
 * result with no transaction, so the form can be driven without a chain.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type MessageV0,
  type TransactionInstruction,
  type Signer,
  type Transaction,
} from '@solana/web3.js';
import { rpcFetch } from '@/lib/solana/connection';
import { config, explorerUrl as configExplorerUrl } from '@/config';
import { DEFAULT_SLIPPAGE_BPS, LAUNCH_COMPUTE_UNITS, MAX_TRANSACTION_BYTES, TRANSFER_FEE_MAX_RAW } from './constants';
import { LaunchPreflightError } from './errors';
import type { LaunchConfig, LaunchQuote } from './launch-config';

export interface PrepareLaunchParams {
  /** The tracker's answer for the selected quote. Not optional: it carries the chain. */
  launchConfig: LaunchConfig;
  /** Which quote to launch against. Must be one of `launchConfig.quotes`. */
  quote: LaunchQuote;
  name: string;
  symbol: string;
  /** Permanent metadata URI, from `POST /api/launch/metadata`. */
  uri: string;
  /** Base58 address of the creator, who pays and signs. */
  creatorWallet: string;
  /** Creator's first buy in whole quote tokens. 0 launches create-only. */
  devBuyQuoteAmount?: number;
  slippageBps?: number;
}

export interface PreparedLaunchSummary {
  mint: string;
  poolId: string;
  quoteMint: string;
  quoteSymbol: string;
  name: string;
  symbol: string;
  metadataUri: string;
  /** Token-2022 transfer tax baked into the mint, in basis points. */
  holderTaxBps: number;
  devBuyQuoteAmount: number;
  /** Graduation raise in whole quote tokens. */
  graduationQuoteAmount: number;
  /** The same raise in raw units, exactly as passed to the program. */
  graduationQuoteRaw: string;
  launchFeeLamports: number;
  launchFeeSol: number;
  treasury: string;
  platformId: string;
  programId: string;
  configId: string;
  createOnly: boolean;
  computeUnits: number;
  mock: boolean;
}

export interface PreparedLaunch {
  /** Null on the mock path. Otherwise the transaction the wallet signs last. */
  transaction: VersionedTransaction | Transaction | null;
  mintKeypair: Keypair;
  mint: string;
  poolId: string;
  /** Blockhash the transaction was built on. Confirmation needs both. */
  blockhash: string;
  lastValidBlockHeight: number;
  summary: PreparedLaunchSummary;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/** True when nothing should touch the chain. */
export function isMockLaunch(): boolean {
  return !config.solana.useRealWallet;
}

/** A stable 32-byte seed for a string, so mock launches repeat exactly. */
function seedFrom(text: string): Uint8Array {
  const out = new Uint8Array(32);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < 32; i++) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    out[i] = h & 0xff;
  }
  return out;
}

function toRaw(amount: number, decimals: number): string {
  return BigInt(Math.max(0, Math.round(amount * 10 ** decimals))).toString();
}

function baseSummary(params: PrepareLaunchParams, mint: string, poolId: string, mock: boolean): PreparedLaunchSummary {
  const { launchConfig, quote } = params;
  const devBuyQuoteAmount = params.devBuyQuoteAmount ?? 0;
  return {
    mint,
    poolId,
    quoteMint: quote.quoteMint,
    quoteSymbol: quote.symbol,
    name: params.name,
    symbol: params.symbol,
    metadataUri: params.uri,
    holderTaxBps: launchConfig.transferFeeBps,
    devBuyQuoteAmount,
    graduationQuoteAmount: launchConfig.raise.units,
    graduationQuoteRaw: launchConfig.raise.raw,
    launchFeeLamports: launchConfig.fee.lamports,
    launchFeeSol: launchConfig.fee.lamports / LAMPORTS_PER_SOL,
    treasury: launchConfig.treasury,
    platformId: launchConfig.platformId,
    programId: launchConfig.programId,
    configId: quote.launchlabConfigId,
    createOnly: devBuyQuoteAmount <= 0,
    computeUnits: LAUNCH_COMPUTE_UNITS,
    mock,
  };
}

function mockLaunch(params: PrepareLaunchParams): PreparedLaunch {
  const tag = `${params.name}|${params.symbol}|${params.quote.quoteMint}`;
  const mintKeypair = Keypair.fromSeed(seedFrom(tag));
  const poolId = Keypair.fromSeed(seedFrom(`pool:${tag}`)).publicKey.toBase58();
  const mint = mintKeypair.publicKey.toBase58();

  return {
    transaction: null,
    mintKeypair,
    mint,
    poolId,
    blockhash: '11111111111111111111111111111111',
    lastValidBlockHeight: 0,
    summary: baseSummary(params, mint, poolId, true),
  };
}

/** Load and decode the quote's LaunchLab config account, which the SDK needs verbatim. */
async function loadQuoteConfig(connection: Connection, configId: PublicKey, quote: LaunchQuote): Promise<unknown> {
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  const account = await connection.getAccountInfo(configId);
  if (!account) {
    throw new Error(`Quote config not found for ${quote.symbol} on ${config.cluster}`);
  }
  return sdk.LaunchpadConfig.decode(account.data);
}

/** Address lookup tables a built message refers to, fetched so it can be rebuilt. */
async function resolveLookupTables(connection: Connection, tx: VersionedTransaction): Promise<AddressLookupTableAccount[]> {
  const keys = tx.message.addressTableLookups.map(l => l.accountKey);
  if (keys.length === 0) return [];
  const accounts = await Promise.all(keys.map(key => connection.getAddressLookupTable(key)));
  return accounts.map(a => a.value).filter((a): a is AddressLookupTableAccount => a !== null);
}

/**
 * Build the launch transaction for the creator to sign.
 *
 * The Token-2022 transfer fee rides on `createLaunchpad`'s
 * `transferFeeExtensionParams`, which is what flips the base mint to
 * Token-2022 and forces CPMM graduation. No hand-rolled instruction needed.
 *
 * @throws {Error} when the quote has no config on this cluster, or when the
 *   launch would need more than one transaction to fit.
 */
/**
 * Compiles the launch message without address lookup tables whenever the
 * transaction still fits Solana's packet, and with them only when it must.
 *
 * Phantom signs some wallets on its servers (the seedless, "migrated" kind)
 * and runs every transaction through a policy check there first. That check
 * cannot resolve lookup tables from what a dApp sends through the wallet
 * standard ("Loaded accounts are not provided, but lookup table is used"), so
 * a table-bearing launch fails for those users after they confirmed. The
 * Raydium SDK adds its tables by default; plain addresses cost more bytes but
 * every wallet can sign them. Exported for tests.
 */
export function compileLaunchMessage(
  args: { payerKey: PublicKey; recentBlockhash: string; instructions: TransactionInstruction[] },
  lookupTables: AddressLookupTableAccount[],
): MessageV0 {
  const message = new TransactionMessage(args);
  const plain = message.compileToV0Message([]);
  if (lookupTables.length === 0 || serializedSize(plain) <= MAX_TRANSACTION_BYTES) return plain;
  return message.compileToV0Message(lookupTables);
}

/** Bytes on the wire once every signature slot is filled; Infinity when web3.js refuses to encode it. */
function serializedSize(message: MessageV0): number {
  try {
    return new VersionedTransaction(message).serialize().length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function prepareLaunch(params: PrepareLaunchParams): Promise<PreparedLaunch> {
  const { launchConfig, quote } = params;
  const devBuyQuoteAmount = params.devBuyQuoteAmount ?? 0;

  if (isMockLaunch()) return mockLaunch(params);

  const [sdk, bnModule] = await Promise.all([import('@raydium-io/raydium-sdk-v2'), import('bn.js')]);
  const BN = bnModule.default;

  const connection = new Connection(config.solana.rpcUrl, { commitment: 'confirmed', fetch: rpcFetch() });
  const owner = new PublicKey(params.creatorWallet);
  const programId = new PublicKey(launchConfig.programId);
  const platformId = new PublicKey(launchConfig.platformId);
  const quoteMint = new PublicKey(quote.quoteMint);
  const configId = new PublicKey(quote.launchlabConfigId);
  const mintKeypair = Keypair.generate();

  const configInfo = await loadQuoteConfig(connection, configId, quote);

  const raydium = await sdk.Raydium.load({
    connection,
    owner,
    cluster: config.cluster === 'mainnet' ? 'mainnet' : 'devnet',
    disableLoadToken: true,
    disableFeatureCheck: true,
  });

  // We pass supply, sell and raise explicitly, so Raydium's hosted config list
  // is never read. Stubbing it keeps a launch working on a cluster their API
  // does not index, such as devnet.
  (raydium.api as unknown as { fetchLaunchConfigs: () => Promise<unknown[]> }).fetchLaunchConfigs = async () => [];

  const { curve } = launchConfig;
  const built = await raydium.launchpad.createLaunchpad({
    programId,
    platformId,
    mintA: mintKeypair.publicKey,
    decimals: curve.baseDecimals,
    mintBDecimals: quote.decimals,
    mintBProgram: new PublicKey(quote.tokenProgram),
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    migrateType: curve.migrateType === 'amm' ? 'amm' : 'cpmm',
    configId,
    configInfo: configInfo as Parameters<typeof raydium.launchpad.createLaunchpad>[0]['configInfo'],
    supply: new BN(curve.supply),
    totalSellA: new BN(curve.totalSellA),
    totalFundRaisingB: new BN(launchConfig.raise.raw),
    totalLockedAmount: new BN(curve.totalLockedAmount || '0'),
    cliffPeriod: new BN(curve.cliffPeriod || '0'),
    unlockPeriod: new BN(curve.unlockPeriod || '0'),
    buyAmount: new BN(toRaw(devBuyQuoteAmount, quote.decimals)),
    createOnly: devBuyQuoteAmount <= 0,
    slippage: new BN(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    // Flips the base mint to Token-2022 and bakes in the holder tax forever.
    transferFeeExtensionParams: {
      transferFeeBasePoints: launchConfig.transferFeeBps,
      maxinumFee: new BN(TRANSFER_FEE_MAX_RAW),
    },
    txVersion: sdk.TxVersion.V0,
    computeBudgetConfig: { units: LAUNCH_COMPUTE_UNITS },
    extraSigners: [mintKeypair],
    feePayer: owner,
  } as Parameters<typeof raydium.launchpad.createLaunchpad>[0]);

  if (built.transactions.length !== 1) {
    throw new Error(
      `The launch needs ${built.transactions.length} transactions, and this flow signs one. Lower the dev buy and try again.`,
    );
  }

  // We asked for TxVersion.V0, so the SDK hands back a versioned transaction.
  const base = built.transactions[0] as VersionedTransaction;
  if (!('message' in base)) {
    throw new Error('The launchpad returned a legacy transaction; a versioned one was requested.');
  }
  const lookupTables = await resolveLookupTables(connection, base);
  const decompiled = TransactionMessage.decompile(base.message, { addressLookupTableAccounts: lookupTables });

  const feeIx = SystemProgram.transfer({
    fromPubkey: owner,
    toPubkey: new PublicKey(launchConfig.treasury),
    lamports: launchConfig.fee.lamports,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = compileLaunchMessage(
    { payerKey: owner, recentBlockhash: blockhash, instructions: [...decompiled.instructions, feeIx] },
    lookupTables,
  );

  const transaction = new VersionedTransaction(message);
  const signers: Signer[] = [mintKeypair, ...(built.signers[0] ?? [])];
  const unique = new Map(signers.map(s => [s.publicKey.toBase58(), s]));
  transaction.sign([...unique.values()]);

  // Before the wallet is opened: the transaction must fit, and the node must
  // agree it would land. A failure here is ours to explain, not Phantom's.
  await preflightLaunch(transaction, connection);

  const poolId = built.extInfo.address.poolId.toBase58();
  const mint = mintKeypair.publicKey.toBase58();
  void quoteMint;

  return {
    transaction,
    mintKeypair,
    mint,
    poolId,
    blockhash,
    lastValidBlockHeight,
    summary: baseSummary(params, mint, poolId, false),
  };
}

/** Program log lines worth showing: the last few, which carry the failing instruction's message. */
function tailLogs(logs: string[] | null | undefined, count = 3): string {
  if (!logs || logs.length === 0) return '';
  return logs.slice(-count).join(' · ');
}

function describeSimulationError(err: unknown): string {
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Size and simulation checks on a built, mint-signed launch transaction.
 *
 * @throws {LaunchPreflightError} when the transaction is over Solana's packet
 *   limit, or when the node's simulation reports an error.
 */
export async function preflightLaunch(transaction: VersionedTransaction, connection: Connection): Promise<void> {
  let bytes: number;
  try {
    bytes = transaction.serialize().length;
  } catch {
    // web3.js refuses to encode past the packet size, so a throw here is the answer.
    bytes = Number.POSITIVE_INFINITY;
  }
  if (bytes > MAX_TRANSACTION_BYTES) {
    throw new LaunchPreflightError(
      `The launch transaction is ${Number.isFinite(bytes) ? `${bytes} bytes` : 'too large'}, over Solana's ${MAX_TRANSACTION_BYTES}-byte limit. Lower the dev buy or shorten the name/symbol/URI.`,
      'size',
    );
  }

  let result: Awaited<ReturnType<Connection['simulateTransaction']>>;
  try {
    result = await connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: true });
  } catch (err) {
    // A node that cannot simulate is not a reason to block the wallet; the send will tell.
    console.warn('[launch] simulation unavailable, continuing', err);
    return;
  }
  if (result.value.err) {
    const logs = tailLogs(result.value.logs);
    throw new LaunchPreflightError(
      `The launch would fail on-chain: ${describeSimulationError(result.value.err)}${logs ? `. ${logs}` : ''}`,
      'simulation',
    );
  }
}

export interface SendAndConfirmOptions {
  blockhash?: string;
  lastValidBlockHeight?: number;
  connection?: Connection;
}

const ownConnection = (given?: Connection): Connection =>
  given ?? new Connection(config.solana.rpcUrl, { commitment: 'confirmed', fetch: rpcFetch() });

/**
 * Send a wallet-signed transaction on our own RPC.
 *
 * Preflight is skipped: the wallet already validated the transaction, and a
 * second node's simulation can reject one that is fine on chain.
 */
export async function sendSigned(signedTx: VersionedTransaction | Transaction, connection?: Connection): Promise<string> {
  return ownConnection(connection).sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
}

/**
 * Wait for a sent transaction, whoever broadcast it (our RPC or the wallet's
 * own node). When confirmation itself fails we ask the network directly
 * before giving up.
 */
export async function confirmSignature(signature: string, options: SendAndConfirmOptions = {}): Promise<void> {
  const connection = ownConnection(options.connection);
  const { blockhash, lastValidBlockHeight } = options;

  try {
    if (blockhash && lastValidBlockHeight) {
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    } else {
      await connection.confirmTransaction(signature, 'confirmed');
    }
  } catch (confirmErr) {
    const status = await connection.getSignatureStatus(signature);
    const state = status?.value?.confirmationStatus;
    if (state !== 'confirmed' && state !== 'finalized') throw confirmErr;
  }
}

/** Send a wallet-signed transaction on our own RPC and wait for it. */
export async function sendAndConfirm(
  signedTx: VersionedTransaction | Transaction,
  options: SendAndConfirmOptions = {},
): Promise<string> {
  const connection = ownConnection(options.connection);
  const signature = await sendSigned(signedTx, connection);
  await confirmSignature(signature, { ...options, connection });
  return signature;
}

/** Explorer link for a signature or address, on whichever cluster we are on. */
export function explorerUrl(kind: 'tx' | 'address' | 'token', value: string): string {
  return configExplorerUrl(kind, value);
}
