/**
 * Purpose: Real wallet implementation — wraps ConnectorKit hooks for any
 *          Wallet Standard wallet (Phantom, Solflare, Backpack, MetaMask,
 *          Mobile Wallet Adapter …): connection through the shared connect
 *          prompt, balance fetching, and transaction signing.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { deepestErrorMessage, isUserRejection, logErrorChain } from '@/lib/launchlab/errors';
import { useConnectorModule } from '@/providers/WalletReadyProvider';
import { signViaBytes, toWalletBytes } from './sign-bytes';
import { requestConnect } from './connect-request';
import { forgetConnector, rememberedConnector } from './last-connector';
import type { WalletService } from './types';
import { abbreviateAddress } from './types';

/** Must only be called under ConnectorKit's AppProvider (SolanaProvider guarantees it). */
export function useRealWallet(): WalletService {
  const mod = useConnectorModule();
  if (!mod) throw new Error('useRealWallet() needs the ConnectorKit module; use useWalletService()');
  // The module never changes for a mounted tree, so the hook call order is stable.
  const {
    useWallet,
    useAccount,
    useConnectWallet,
    useDisconnectWallet,
    useBalance,
    useTransactionSigner,
    useWalletConnectors,
    useCluster,
  } = mod;

  const { isConnected, isConnecting } = useWallet();
  const { address } = useAccount();
  const { connect: connectorConnect, error: connectError } = useConnectWallet();
  const { disconnect: connectorDisconnect } = useDisconnectWallet();
  const { solBalance, refetch: refetchBalance } = useBalance({ enabled: isConnected });
  const { signer } = useTransactionSigner();
  const connectors = useWalletConnectors();
  const { cluster } = useCluster();

  const [error, setError] = useState<string | null>(null);

  // If connector autoConnect misses on refresh, retry once using the last
  // successful connector id we persisted on manual connect.
  useEffect(() => {
    if (isConnected || isConnecting || connectors.length === 0) return;
    const savedId = rememberedConnector();
    if (!savedId) return;
    const savedConnector = connectors.find(c => c.id === savedId);
    if (!savedConnector) return;
    connectorConnect(savedConnector.id).catch(() => {
      // Keep this silent; users can still connect manually via UI.
    });
  }, [isConnected, isConnecting, connectors, connectorConnect]);

  // Sync ConnectorKit connect errors to local state. A successful connection
  // clears whatever an earlier attempt left behind (ConnectorKit keeps the last
  // error, e.g. WalletConnect's "Connection cancelled" after the user closed
  // its QR modal and picked a browser wallet instead), and a cancellation the
  // user caused is not an error worth showing.
  useEffect(() => {
    if (isConnected) {
      setError(null);
      return;
    }
    if (connectError) {
      setError(isUserRejection(connectError) ? null : connectError.message);
    }
  }, [connectError, isConnected]);

  const installed = connectors.some(c => c.ready);

  /* Every surface connects the same way: the shared prompt picks the wallet. */
  const connect = useCallback(async () => {
    if (isConnected) return true;
    setError(null);
    return requestConnect();
  }, [isConnected]);

  const disconnect = useCallback(async () => {
    // Clear saved connector BEFORE disconnecting — the auto-reconnect effect
    // fires when isConnected flips to false and would re-connect if the key still exists.
    forgetConnector();
    try {
      await connectorDisconnect();
    } catch {
      // Ignore disconnect errors
    }
  }, [connectorDisconnect]);

  const fetchBalance = useCallback(async () => {
    if (!isConnected) return;
    await refetchBalance();
  }, [isConnected, refetchBalance]);

  const sign = useCallback(
    async (tx: Parameters<WalletService['sign']>[0]) => {
      if (!signer) throw new Error('Wallet not connected');
      try {
        // Bytes in, bytes out: see sign-bytes.ts for why the connector must
        // not be handed the web3.js object.
        return await signViaBytes(
          bytes => signer.signTransaction(bytes as unknown as Parameters<typeof signer.signTransaction>[0]),
          tx,
        );
      } catch (err) {
        // The connector wraps the wallet's own message as "Failed to sign
        // transaction"; surface the deepest one and keep the chain as the cause.
        logErrorChain('wallet.sign', err);
        const inner = deepestErrorMessage(err) ?? 'Failed to sign transaction';
        const wrapped = new Error(inner, { cause: err });
        const code = (err as { code?: unknown } | null)?.code;
        if (code !== undefined) (wrapped as Error & { code?: unknown }).code = code;
        throw wrapped;
      }
    },
    [signer],
  );

  const signAndSend = useCallback(
    async (tx: Parameters<WalletService['signAndSend']>[0]) => {
      if (!signer) throw new Error('Wallet not connected');
      try {
        // Bytes in for the same reason as `sign`; only a signature comes back.
        const signature = await signer.signAndSendTransaction(await toWalletBytes(tx));
        return { signature };
      } catch (err) {
        // The connector wraps the wallet's own message as "Failed to send
        // transaction"; surface the deepest one and keep the chain as the cause,
        // so a rejection stays recognisable and the caller's fallback can decide.
        logErrorChain('wallet.signAndSend', err);
        const inner = deepestErrorMessage(err) ?? 'Failed to send transaction';
        const wrapped = new Error(inner, { cause: err });
        const code = (err as { code?: unknown } | null)?.code;
        if (code !== undefined) (wrapped as Error & { code?: unknown }).code = code;
        throw wrapped;
      }
    },
    [signer],
  );

  return {
    installed,
    connected: isConnected,
    publicKey: address ?? null,
    shortAddress: address ? abbreviateAddress(address) : null,
    balance: isConnected ? solBalance : null,
    connecting: isConnecting,
    error,
    network: cluster?.id ?? null,
    connect,
    disconnect,
    fetchBalance,
    sign,
    signAndSend,
  };
}
