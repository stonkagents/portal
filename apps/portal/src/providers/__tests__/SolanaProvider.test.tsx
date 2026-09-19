/**
 * Purpose: Tests for SolanaProvider — passthrough when mock, ConnectorKit when real
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock ConnectorKit — we just verify the provider tree renders
const getDefaultConfig = vi.hoisted(() => vi.fn((_opts: Record<string, unknown>) => ({})));
vi.mock('@solana/connector/react', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="connector-provider">{children}</div>,
  getDefaultConfig,
}));

const originalEnv = process.env.NEXT_PUBLIC_USE_REAL_WALLET;

describe('SolanaProvider', () => {
  /* The first import transforms the wallet and connect-prompt tree; on a loaded machine that alone can pass the per-test 5s. */
  beforeAll(async () => {
    await import('../SolanaProvider');
    vi.resetModules();
  }, 30_000);

  afterEach(() => {
    process.env.NEXT_PUBLIC_USE_REAL_WALLET = originalEnv;
    vi.unstubAllEnvs();
    getDefaultConfig.mockClear();
    vi.resetModules();
  });

  it('renders children directly when USE_REAL_WALLET is false', async () => {
    process.env.NEXT_PUBLIC_USE_REAL_WALLET = 'false';
    const { SolanaProvider } = await import('../SolanaProvider');
    render(
      <SolanaProvider>
        <span data-testid="child">hello</span>
      </SolanaProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('connector-provider')).not.toBeInTheDocument();
  });

  it('wraps children with ConnectorKit when USE_REAL_WALLET is true', async () => {
    process.env.NEXT_PUBLIC_USE_REAL_WALLET = 'true';
    const { SolanaProvider } = await import('../SolanaProvider');
    render(
      <SolanaProvider>
        <span data-testid="child">hello</span>
      </SolanaProvider>,
    );
    // Children render immediately (with WalletReadyProvider ready=false)
    expect(screen.getByTestId('child')).toBeInTheDocument();
    // ConnectorKit loads asynchronously via useEffect — wait for it
    await waitFor(() => {
      expect(screen.getByTestId('connector-provider')).toBeInTheDocument();
    });
  });

  it('takes the wallet network from NEXT_PUBLIC_SOLANA_CLUSTER, the one cluster switch', async () => {
    process.env.NEXT_PUBLIC_USE_REAL_WALLET = 'true';
    vi.stubEnv('NEXT_PUBLIC_SOLANA_CLUSTER', 'mainnet');
    const { SolanaProvider } = await import('../SolanaProvider');
    render(
      <SolanaProvider>
        <span data-testid="child">hello</span>
      </SolanaProvider>,
    );
    await waitFor(() => expect(getDefaultConfig).toHaveBeenCalledTimes(1));
    expect(getDefaultConfig.mock.calls[0][0]).toMatchObject({ network: 'mainnet-beta', appName: 'StonkAgents' });
  });

  it('ignores a conflicting legacy NEXT_PUBLIC_SOLANA_NETWORK and follows the cluster', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_USE_REAL_WALLET = 'true';
    vi.stubEnv('NEXT_PUBLIC_SOLANA_CLUSTER', 'devnet');
    vi.stubEnv('NEXT_PUBLIC_SOLANA_NETWORK', 'mainnet-beta');
    const { SolanaProvider } = await import('../SolanaProvider');
    render(
      <SolanaProvider>
        <span data-testid="child">hello</span>
      </SolanaProvider>,
    );
    await waitFor(() => expect(getDefaultConfig).toHaveBeenCalledTimes(1));
    expect(getDefaultConfig.mock.calls[0][0]).toMatchObject({ network: 'devnet' });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
