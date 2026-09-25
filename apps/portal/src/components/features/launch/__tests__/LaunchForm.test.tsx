import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LAUNCH_CONFIG, SOL_QUOTE, STONK_QUOTE } from '@/lib/launchlab/__fixtures__/launch-config';
import { MOCK_DATA_URL, mockCanvas } from '@/test/canvas-mock';
import type { LaunchResult } from '../types';
import type * as LaunchConfigModule from '@/lib/launchlab/launch-config';
import { LaunchConfigError } from '@/lib/launchlab/launch-config';
import type * as LaunchesModule from '@/lib/api/launches';
import type * as TopupModule from '@/lib/jupiter/use-stonk-topup';
import { LaunchApiError } from '@/lib/api/launches';

const wallet = {
  installed: true,
  connected: true,
  publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  shortAddress: '7xKXtg...gAsU',
  balance: 1.5,
  connecting: false,
  error: null as string | null,
  network: 'solana:devnet' as string | null,
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  fetchBalance: vi.fn(async () => undefined),
  sign: vi.fn(async (tx: unknown) => tx),
  signAndSend: vi.fn(async () => ({ signature: 'sig' })),
};

vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));

// Raw units, as the chain reports them: $STONK has 9 decimals.
const STONK_RAW = 1e9;
const holderBalance = vi.hoisted(() => vi.fn(() => ({ balance: 1_000_000 * 1e9, isHolder: true, loading: false })));
vi.mock('@/lib/api/hooks/use-holder-balance', () => ({ useHolderBalance: () => holderBalance() }));

// The real top-up hook runs (this build is devnet, so it stays off); a test on the mainnet path lays its own answer over it.
const topupOverride = vi.hoisted(() => ({ current: null as Partial<TopupModule.StonkTopupController> | null }));
vi.mock('@/lib/jupiter/use-stonk-topup', async () => {
  const actual = await vi.importActual<typeof TopupModule>('@/lib/jupiter/use-stonk-topup');
  return {
    ...actual,
    useStonkTopup: (params: TopupModule.UseStonkTopupParams) => {
      const real = actual.useStonkTopup(params);
      return topupOverride.current ? { ...real, ...topupOverride.current } : real;
    },
  };
});

const useLaunchConfig = vi.fn();
vi.mock('@/lib/launchlab/launch-config', async () => {
  const actual = await vi.importActual<typeof LaunchConfigModule>('@/lib/launchlab/launch-config');
  return { ...actual, useLaunchConfig: (mint?: string) => useLaunchConfig(mint) };
});

const uploadMetadata = vi.fn();
const recordLaunch = vi.fn();
const fetchLaunchesByWallet = vi.fn();
const getLaunch = vi.fn();
vi.mock('@/lib/api/launches', async () => {
  const actual = await vi.importActual<typeof LaunchesModule>('@/lib/api/launches');
  return {
    LaunchApiError: actual.LaunchApiError,
    uploadMetadata: (...args: unknown[]) => uploadMetadata(...args),
    recordLaunch: (...args: unknown[]) => recordLaunch(...args),
    fetchLaunchesByWallet: (...args: unknown[]) => fetchLaunchesByWallet(...args),
    getLaunch: (...args: unknown[]) => getLaunch(...args),
  };
});

vi.mock('@/lib/api/price', () => ({
  getPricesUsd: vi.fn(async () => ({ [STONK_QUOTE.quoteMint]: 0.25 })),
}));

const prepareLaunch = vi.fn();
const sendAndConfirm = vi.fn();
const completeLaunchSignatures = vi.fn((tx: unknown, _signers: unknown) => tx);
const isMockLaunch = vi.fn(() => false);
vi.mock('@/lib/launchlab/build-launch', () => ({
  prepareLaunch: (...args: unknown[]) => prepareLaunch(...args),
  sendAndConfirm: (...args: unknown[]) => sendAndConfirm(...args),
  completeLaunchSignatures: (tx: unknown, signers: unknown) => completeLaunchSignatures(tx, signers),
  isMockLaunch: () => isMockLaunch(),
  explorerUrl: (kind: string, id: string) => `https://explorer.example/${kind}/${id}`,
}));

import { LaunchForm } from '../LaunchForm';

// The token page of the wallet's existing agent. `next/link` drops the trailing slash outside a Next build.
const EXISTING_HREF = /^\/tokens\/MintOLD\/?$/;

const DEVNET_CONFIG = { ...LAUNCH_CONFIG, cluster: 'devnet' };
const MAINNET_BETA_CONFIG = { ...LAUNCH_CONFIG, cluster: 'mainnet-beta' };

const MASTER_DATA_URL = 'data:image/webp;base64,TUFTVEVS';
const THUMB_DATA_URL = 'data:image/webp;base64,VEhVTUI=';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// jsdom never decodes images: this Image reports the size the test asks for and fires onload.
const imageSize = { width: 1, height: 1 };
class MockImage {
  width = imageSize.width;
  height = imageSize.height;
  onload: (() => void) | null = null;
  #src = '';
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Render and let the price lookup settle, so no state update lands outside act. */
async function renderForm(props: Partial<React.ComponentProps<typeof LaunchForm>> = {}) {
  const view = render(<LaunchForm onLaunched={vi.fn()} {...props} />, { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

function settled(config: typeof LAUNCH_CONFIG) {
  return {
    data: config,
    isPlaceholderData: false,
    isError: false,
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => ({ data: config })),
  };
}

async function fillForm() {
  fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Signal Hound' } });
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'hound' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A hound for signals.' } });
  fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'https://hound.example' } });
  const file = new File([Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0))], 'hound.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText('Signal Hound artwork')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Image', MockImage);
  imageSize.width = 1;
  imageSize.height = 1;
  mockCanvas();
  topupOverride.current = null;
  useLaunchConfig.mockImplementation(() => settled(LAUNCH_CONFIG));
  uploadMetadata.mockResolvedValue({
    imageUri: 'https://gateway.example/ipfs/img',
    metadataUri: 'https://gateway.example/ipfs/meta',
    bytes: 10,
    metadataBytes: 100,
    contentType: 'image/png',
  });
  prepareLaunch.mockResolvedValue({
    transaction: { fake: true },
    signers: [{ fakeSigner: true }],
    mint: 'MintAAA',
    poolId: 'PoolAAA',
    blockhash: 'bh',
    lastValidBlockHeight: 1,
    summary: { mock: false },
  });
  sendAndConfirm.mockResolvedValue('sig123');
  recordLaunch.mockResolvedValue({ mint: 'MintAAA' });
  fetchLaunchesByWallet.mockResolvedValue([]);
  getLaunch.mockRejectedValue(new Error('not mocked'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pickImage(width: number, height: number) {
  imageSize.width = width;
  imageSize.height = height;
  const file = new File([Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0))], 'hound.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('artwork-adjust')).toBeInTheDocument());
}

describe('LaunchForm', () => {
  it('prices the launch for $STONK and shows the summary rows stonkfun-style', async () => {
    await renderForm();

    expect(useLaunchConfig).toHaveBeenCalledWith(undefined);
    expect(screen.queryByTestId('quote-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fee-model')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-paired-with')).toHaveTextContent('$STONK');
    expect(screen.getByTestId('summary-graduates-at')).toHaveTextContent('32,230.14 $STONK');
    expect(screen.getByTestId('summary-trading-fee')).toHaveTextContent('1.25%');
    expect(screen.getByTestId('summary-transfer-tax-holders')).toHaveTextContent('1%');
    expect(screen.getByTestId('summary-launch-cost')).toHaveTextContent('≈ 0.020 SOL');
    // Label and value only, no helper sentences on the card.
    expect(screen.queryByText(/Sized so this launch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Starts at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/collected by the token itself/)).not.toBeInTheDocument();
    expect(screen.getByText('Image and metadata are stored permanently on IPFS.')).toBeInTheDocument();
    expect(screen.getByText('Liquidity is permanently locked at graduation.')).toBeInTheDocument();
    expect(screen.queryByText(/stored in the token/)).not.toBeInTheDocument();
  });

  it('orders the form name, symbol, description, image, dev buy, then project links', async () => {
    await renderForm();
    const form = screen.getByTestId('launch-form');
    const order = [
      screen.getByLabelText('Agent name'),
      screen.getByLabelText('Symbol'),
      screen.getByLabelText('Description'),
      screen.getByLabelText('Agent image'),
      screen.getByTestId('dev-buy'),
      screen.getByLabelText('Website'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(form.contains(order[i])).toBe(true);
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('shows the loading state until the launch config arrives, and a retry when it fails', () => {
    useLaunchConfig.mockReturnValue({ data: undefined, isPlaceholderData: false, isError: false, isLoading: true, refetch: vi.fn() });
    const { rerender } = render(<LaunchForm onLaunched={vi.fn()} />, { wrapper });
    expect(screen.getByTestId('launch-config-loading')).toBeInTheDocument();

    const refetch = vi.fn();
    useLaunchConfig.mockReturnValue({
      data: undefined,
      isPlaceholderData: false,
      isError: true,
      isLoading: false,
      error: new Error('The launchpad is not answering (503).'),
      refetch,
    });
    rerender(<LaunchForm onLaunched={vi.fn()} />);
    expect(screen.getByTestId('launch-config-error')).toHaveTextContent('not answering (503)');
    fireEvent.click(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the button off until a name, a symbol and an image are in', async () => {
    await renderForm();
    const action = screen.getByTestId('launch-action');
    expect(action).toBeDisabled();
    expect(screen.getByTestId('launch-action-note')).toHaveTextContent('Add a name, a symbol and an image to launch.');
    fireEvent.click(action);
    expect(prepareLaunch).not.toHaveBeenCalled();

    await fillForm();
    expect(screen.getByTestId('launch-action')).toBeEnabled();
    expect(screen.queryByTestId('launch-action-note')).not.toBeInTheDocument();
  });

  it('squares a non-square image around the centre and opens the studio to adjust it', async () => {
    await renderForm();
    expect(screen.queryByTestId('artwork-studio')).not.toBeInTheDocument();
    await pickImage(1600, 900);

    expect(screen.getByTestId('artwork-studio')).toBeInTheDocument();
    expect(screen.getByTestId('artwork-tab-image')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/will be cropped/)).not.toBeInTheDocument();
    // The form already carries the centred square, so a cancel keeps it.
    expect(screen.getByAltText('Your token artwork')).toHaveAttribute('src', MOCK_DATA_URL);
    fireEvent.click(screen.getByTestId('artwork-cancel'));
    expect(screen.queryByTestId('artwork-studio')).not.toBeInTheDocument();
    expect(screen.getByAltText('Your token artwork')).toHaveAttribute('src', MOCK_DATA_URL);

    fireEvent.click(screen.getByTestId('artwork-adjust'));
    expect(screen.getByTestId('artwork-studio')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('artwork-finish-neon'));
    fireEvent.click(screen.getByTestId('artwork-apply'));
    expect(screen.queryByTestId('artwork-studio')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-action')).toBeDisabled();
  });

  it('paints a square image through the same painter without opening the studio, one Adjust away', async () => {
    await renderForm();
    await pickImage(800, 800);
    expect(screen.queryByTestId('artwork-studio')).not.toBeInTheDocument();
    // The raw file is never what goes up: the 512 px master replaces it once the image has decoded.
    expect(screen.getByAltText('Your token artwork')).toHaveAttribute('src', MOCK_DATA_URL);
    fireEvent.click(screen.getByTestId('artwork-adjust'));
    expect(screen.getByTestId('artwork-zoom')).toHaveAttribute('min', '1');
  });

  it('makes a symbol mark from the ticker without any image', async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Signal Hound' } });
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'hound' } });
    fireEvent.click(screen.getByTestId('artwork-make-symbol'));

    expect(screen.getByTestId('artwork-tab-symbol')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('artwork-tab-image')).toBeDisabled();
    expect(screen.getByTestId('artwork-symbol-input')).toHaveValue('HO');
    fireEvent.click(screen.getByTestId('artwork-apply'));

    expect(screen.queryByTestId('artwork-studio')).not.toBeInTheDocument();
    expect(screen.getByAltText('Signal Hound artwork')).toHaveAttribute('src', MOCK_DATA_URL);
    expect(screen.queryByTestId('artwork-make-symbol')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-action')).toBeEnabled();
    // Adjust reopens the mark, not an empty image tab.
    fireEvent.click(screen.getByTestId('artwork-adjust'));
    expect(screen.getByTestId('artwork-symbol-input')).toHaveValue('HO');
  });

  it('re-prices right before signing, launches on the latest raise and says it moved', async () => {
    const moved = {
      ...LAUNCH_CONFIG,
      raise: { ...LAUNCH_CONFIG.raise, raw: `${LAUNCH_CONFIG.raise.raw}1`, units: LAUNCH_CONFIG.raise.units * 10 },
    };
    useLaunchConfig.mockImplementation(() => ({ ...settled(LAUNCH_CONFIG), refetch: vi.fn(async () => ({ data: moved })) }));
    uploadMetadata.mockResolvedValue({
      imageUri: 'https://gateway.example/ipfs/img',
      metadataUri: 'https://gateway.example/ipfs/meta',
      bytes: 10,
      metadataBytes: 100,
      contentType: 'image/webp',
    });
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));
    await waitFor(() => expect(uploadMetadata).toHaveBeenCalled());
  });

  it('shows the wallet quote balance in whole units and blocks a dev buy it cannot cover', async () => {
    holderBalance.mockReturnValue({ balance: 10 * STONK_RAW, isHolder: true, loading: false });
    await renderForm();
    await fillForm();
    expect(screen.getByTestId('dev-buy-balance')).toHaveTextContent('You hold 10 $STONK.');
    fireEvent.change(screen.getByTestId('dev-buy-slider'), { target: { value: '5' } });
    await waitFor(() =>
      expect(screen.getByTestId('dev-buy-balance')).toHaveTextContent(
        /Your dev buy needs .* \$STONK; this wallet holds 10\. Lower it or top up\./,
      ),
    );
    expect(screen.getByTestId('launch-action')).toBeDisabled();
    expect(screen.queryByTestId('stonk-topup')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-action')).toHaveTextContent('Launch Agent');
    holderBalance.mockReturnValue({ balance: 1_000_000 * STONK_RAW, isHolder: true, loading: false });
  });

  describe('with a $STONK top-up on offer', () => {
    const run = vi.fn<() => Promise<TopupModule.TopupOutcome>>();
    const quote = { solIn: 0.42, maxSolIn: 0.4242, stonkOut: 1_250, rate: 2_976, priceImpactPct: 0.1, quotedAt: 0 };
    const offer = (): Partial<TopupModule.StonkTopupController> => ({
      canTopUp: true,
      shortfall: 1_225.5,
      quote: quote as unknown as TopupModule.TopupQuote,
      quoting: false,
      quoteError: null,
      solInsufficient: null,
      status: { kind: 'idle' },
      run,
    });
    beforeEach(() => {
      holderBalance.mockReturnValue({ balance: 10 * STONK_RAW, isHolder: true, loading: false });
      run.mockReset().mockResolvedValue('done');
      topupOverride.current = offer();
    });
    afterEach(() => {
      holderBalance.mockReturnValue({ balance: 1_000_000 * STONK_RAW, isHolder: true, loading: false });
    });

    it('turns the button into the swap and, once the swap is done, launches without another click', async () => {
      await renderForm();
      await fillForm();
      fireEvent.change(screen.getByTestId('dev-buy-slider'), { target: { value: '5' } });
      await waitFor(() => expect(screen.getByTestId('dev-buy-balance')).toHaveTextContent(/Lower it, or swap SOL for the rest\./));
      expect(screen.getByTestId('stonk-topup')).toHaveTextContent('swaps ~0.42 SOL for 1,250 $STONK via Jupiter');
      expect(screen.getByTestId('stonk-topup')).toHaveTextContent('then the launch continues');
      const button = screen.getByTestId('launch-action');
      expect(button).toHaveTextContent('Swap ~0.42 SOL for 1,250 $STONK and continue');
      expect(button).toBeEnabled();
      fireEvent.click(button);
      await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(uploadMetadata).toHaveBeenCalled());
      expect(fetchLaunchesByWallet).toHaveBeenCalled();
    });

    it('stays on the form when the wallet declines the swap', async () => {
      run.mockResolvedValue('cancelled');
      await renderForm();
      await fillForm();
      fireEvent.change(screen.getByTestId('dev-buy-slider'), { target: { value: '5' } });
      await waitFor(() => expect(screen.getByTestId('launch-action')).toHaveTextContent(/^Swap/));
      fireEvent.click(screen.getByTestId('launch-action'));
      await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
      await act(async () => {
        await Promise.resolve();
      });
      expect(uploadMetadata).not.toHaveBeenCalled();
      expect(screen.getByTestId('launch-form')).toBeInTheDocument();
    });

    it('waits for a quote, and says when the SOL does not stretch to the swap', async () => {
      topupOverride.current = { ...offer(), quote: null, quoting: true };
      await renderForm();
      await fillForm();
      fireEvent.change(screen.getByTestId('dev-buy-slider'), { target: { value: '5' } });
      await waitFor(() => expect(screen.getByTestId('launch-action')).toHaveTextContent('Quoting swap…'));
      expect(screen.getByTestId('launch-action')).toBeDisabled();

      topupOverride.current = {
        ...offer(),
        solInsufficient: 'This wallet holds 0.1 SOL; the swap needs about 0.424 SOL, plus about 0.025 SOL for the launch.',
      };
      fireEvent.change(screen.getByTestId('dev-buy-slider'), { target: { value: '6' } });
      await waitFor(() => expect(screen.getByTestId('stonk-topup-problem')).toHaveTextContent('the swap needs about 0.424 SOL'));
      expect(screen.getByTestId('launch-action')).toBeDisabled();
    });
  });

  it('blocks a launch the wallet cannot pay for in SOL', async () => {
    const had = wallet.balance;
    wallet.balance = 0.001;
    await renderForm();
    await fillForm();
    expect(screen.getByTestId('launch-sol-short')).toHaveTextContent(/holds 0 SOL; the launch needs about/);
    /* A first-time creator is told where SOL comes from, not only that it is missing. */
    expect(screen.getByTestId('launch-sol-short')).toHaveTextContent(/test SOL is sent once a day|Send SOL to this wallet/);
    expect(screen.getByTestId('launch-action')).toBeDisabled();
    wallet.balance = had;
  });

  it('lets the dev buy be typed with decimals instead of resetting to zero', async () => {
    await renderForm();
    await fillForm();
    const percent = screen.getByTestId('dev-buy-percent');
    fireEvent.change(percent, { target: { value: '0.' } });
    expect(percent).toHaveValue('0.');
    fireEvent.change(percent, { target: { value: '0.5' } });
    expect(percent).toHaveValue('0.5');
    await waitFor(() => expect(screen.getByTestId('dev-buy-cost')).not.toHaveTextContent(/^0 /));
    fireEvent.change(percent, { target: { value: 'abc' } });
    expect(percent).toHaveValue('0.5');
  });

  it('brings the studio and the project links into view and focus when asked for', async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'hound' } });
    fireEvent.click(screen.getByTestId('artwork-make-symbol'));
    await waitFor(() => expect(screen.getByTestId('artwork-symbol-input')).toHaveFocus());
    fireEvent.click(screen.getByTestId('project-links-jump'));
    await waitFor(() => expect(screen.getByLabelText('Website')).toHaveFocus());
  });

  it('caps the name and symbol at the on-chain limits and strips whitespace from the symbol', async () => {
    await renderForm();
    const name = screen.getByLabelText('Agent name');
    const symbol = screen.getByLabelText('Symbol');
    expect(name).toHaveAttribute('maxlength', '32');
    expect(symbol).toHaveAttribute('maxlength', '10');

    fireEvent.change(symbol, { target: { value: ' ho und ' } });
    expect(symbol).toHaveValue('HOUND');

    fireEvent.change(symbol, { target: { value: 'HO-UND' } });
    expect(screen.getByText('Letters, numbers and $ only')).toBeInTheDocument();
    expect(screen.getByTestId('launch-action')).toBeDisabled();

    fireEvent.change(name, { target: { value: 'x'.repeat(33) } });
    expect(screen.getByText('Keep the name to 32 characters')).toBeInTheDocument();
  });

  it('shows the wallet error under the button instead of opening a tab', async () => {
    wallet.connected = false;
    wallet.error = 'Phantom not installed. Get it at https://phantom.app';
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderForm();
    const note = screen.getByTestId('launch-action-note');
    expect(note).toHaveTextContent('Phantom not installed. Get it at https://phantom.app');
    expect(note.querySelector('a')).toHaveAttribute('href', 'https://phantom.app');
    fireEvent.click(screen.getByTestId('launch-action'));
    expect(wallet.connect).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    wallet.connected = true;
    wallet.error = null;
  });

  it('connects the wallet first when it is not connected, and says Launch Agent once it is', async () => {
    wallet.connected = true;
    await renderForm();
    expect(screen.getByTestId('launch-action')).toHaveTextContent('Launch Agent');
    wallet.connected = false;
    await renderForm();
    expect(screen.getAllByTestId('launch-action').at(-1)).toHaveTextContent('Connect wallet');
    fireEvent.click(screen.getAllByTestId('launch-action').at(-1)!);
    expect(wallet.connect).toHaveBeenCalled();
    wallet.connected = true;
  });

  it('uploads, builds from the config, signs, confirms, records with the exact body and hands the result on', async () => {
    const onLaunched = vi.fn();
    const onConfirmed = vi.fn();
    // Tell the master and the thumb apart by the quality each is exported at.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((_type?: string, quality?: unknown) =>
      quality === 0.85 ? THUMB_DATA_URL : MASTER_DATA_URL,
    );
    uploadMetadata.mockResolvedValue({
      imageUri: 'https://gateway.example/ipfs/img',
      thumbnailUri: 'https://gateway.example/ipfs/thumb',
      metadataUri: 'https://gateway.example/ipfs/meta',
      bytes: 10,
      thumbnailBytes: 2,
      metadataBytes: 100,
      contentType: 'image/webp',
    });
    await renderForm({ onLaunched, onConfirmed });
    await fillForm();
    await waitFor(() => expect(screen.getByAltText('Signal Hound artwork')).toHaveAttribute('src', MASTER_DATA_URL));

    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());

    expect(uploadMetadata).toHaveBeenCalledWith({
      name: 'Signal Hound',
      symbol: 'HOUND',
      description: 'A hound for signals.',
      website: 'https://hound.example',
      twitter: '',
      telegram: '',
      creatorWallet: wallet.publicKey,
      imageDataUrl: MASTER_DATA_URL,
      thumbnailDataUrl: THUMB_DATA_URL,
    });

    expect(prepareLaunch).toHaveBeenCalledTimes(1);
    const prepared = prepareLaunch.mock.calls[0][0] as Record<string, unknown>;
    expect(prepared.launchConfig).toBe(LAUNCH_CONFIG);
    expect(prepared.quote).toBe(STONK_QUOTE);
    expect(prepared).toMatchObject({
      name: 'Signal Hound',
      symbol: 'HOUND',
      uri: 'https://gateway.example/ipfs/meta',
      creatorWallet: wallet.publicKey,
      devBuyQuoteAmount: 0,
    });

    expect(wallet.sign).toHaveBeenCalledWith({ fake: true });
    expect(sendAndConfirm).toHaveBeenCalledWith({ fake: true }, { blockhash: 'bh', lastValidBlockHeight: 1 });
    // Phantom signs first; the mint and SDK signers are added to what it returned, before the send.
    expect(completeLaunchSignatures).toHaveBeenCalledWith({ fake: true }, [{ fakeSigner: true }]);
    expect(completeLaunchSignatures.mock.invocationCallOrder[0]).toBeGreaterThan(wallet.sign.mock.invocationCallOrder[0]);
    expect(completeLaunchSignatures.mock.invocationCallOrder[0]).toBeLessThan(sendAndConfirm.mock.invocationCallOrder[0]);

    expect(recordLaunch).toHaveBeenCalledWith({
      mint: 'MintAAA',
      poolId: 'PoolAAA',
      creatorWallet: wallet.publicKey,
      quoteMint: STONK_QUOTE.quoteMint,
      name: 'Signal Hound',
      symbol: 'HOUND',
      imageUrl: 'https://gateway.example/ipfs/img',
      imageThumbUrl: 'https://gateway.example/ipfs/thumb',
      metadataUri: 'https://gateway.example/ipfs/meta',
      launchSignature: 'sig123',
      feeLamports: LAUNCH_CONFIG.fee.lamports,
      transferFeeBps: LAUNCH_CONFIG.transferFeeBps,
    });
    // The upload happens before the build: the mint's URI needs it.
    expect(uploadMetadata.mock.invocationCallOrder[0]).toBeLessThan(prepareLaunch.mock.invocationCallOrder[0]);
    expect(recordLaunch.mock.invocationCallOrder[0]).toBeGreaterThan(sendAndConfirm.mock.invocationCallOrder[0]);

    const expected: Partial<LaunchResult> = {
      mint: 'MintAAA',
      poolId: 'PoolAAA',
      txSignature: 'sig123',
      symbol: 'HOUND',
      imageUrl: 'https://gateway.example/ipfs/img',
      imageThumbUrl: 'https://gateway.example/ipfs/thumb',
      quoteSymbol: 'STONK',
      holderTaxBps: 100,
      feeLamports: LAUNCH_CONFIG.fee.lamports,
      programId: LAUNCH_CONFIG.programId,
      recorded: true,
      mock: false,
    };
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(screen.queryByTestId('launch-record-pending')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('launch-continue'));
    expect(onLaunched).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('sends no thumbnail and records none when the browser could not paint one', async () => {
    // A canvas that cannot export leaves the raw pick in place and nothing to thumb.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('');
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));
    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());

    const upload = uploadMetadata.mock.calls[0][0] as Record<string, unknown>;
    expect(upload.imageDataUrl).toEqual(expect.stringMatching(/^data:image\/png;base64,/));
    expect(upload).not.toHaveProperty('thumbnailDataUrl');
    const record = recordLaunch.mock.calls[0][0] as Record<string, unknown>;
    expect(record).not.toHaveProperty('imageThumbUrl');
  });

  it('keeps a live token when the tracker fails to record it, says so, and retries with the same body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordLaunch.mockRejectedValueOnce(new LaunchApiError('tx not found yet', 422, 'TX_NOT_FOUND'));
    const onConfirmed = vi.fn();
    await renderForm({ onConfirmed });
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    // The real reason, not a "will appear" promise: the tracker answered and refused.
    expect(screen.getByTestId('launch-record-failed')).toHaveTextContent('did not record it (TX_NOT_FOUND): tx not found yet');
    expect(screen.queryByTestId('launch-record-pending')).not.toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        recorded: false,
        mint: 'MintAAA',
        recordError: expect.objectContaining({ kind: 'error', attempts: 1 }),
      }),
    );
    // Continue is still there: the token is live and this wallet's.
    expect(screen.getByTestId('launch-continue')).toBeInTheDocument();

    const firstBody = recordLaunch.mock.calls[0][0];
    fireEvent.click(screen.getByTestId('launch-record-retry'));
    await waitFor(() => expect(recordLaunch).toHaveBeenCalledTimes(2));
    expect(recordLaunch.mock.calls[1][0]).toEqual(firstBody);
    await waitFor(() => expect(screen.queryByTestId('launch-record-failed')).not.toBeInTheDocument());
    expect(onConfirmed).toHaveBeenLastCalledWith(expect.objectContaining({ recorded: true, recordError: null }));
  });

  it('sends the record with the quote the tracker named as defaultQuoteMint', async () => {
    const named = { ...LAUNCH_CONFIG, defaultQuoteMint: STONK_QUOTE.quoteMint };
    useLaunchConfig.mockImplementation(() => settled(named));
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(recordLaunch.mock.calls[0][0]).toMatchObject({ quoteMint: STONK_QUOTE.quoteMint });
    expect((prepareLaunch.mock.calls[0][0] as { quote: { quoteMint: string } }).quote.quoteMint).toBe(STONK_QUOTE.quoteMint);
  });

  it('shows a 422 QUOTE_NOT_ALLOWED on the record as a hard refusal with no retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordLaunch.mockRejectedValueOnce(
      new LaunchApiError('only the $STONK quote is launchable on this platform', 422, 'QUOTE_NOT_ALLOWED'),
    );
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(screen.getByTestId('launch-record-failed')).toHaveTextContent(
      'did not record it (QUOTE_NOT_ALLOWED): only $STONK launches are listed, and this one was not raised in $STONK',
    );
    expect(screen.queryByTestId('launch-record-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-record-pending')).not.toBeInTheDocument();
  });

  it('shows a 422 QUOTE_NOT_ALLOWED on the config as a refusal, not an outage', async () => {
    const refused = new LaunchConfigError(
      'Only $STONK launches are allowed on this launchpad (QUOTE_NOT_ALLOWED): only the $STONK quote is launchable on this platform.',
      422,
      'QUOTE_NOT_ALLOWED',
    );
    useLaunchConfig.mockImplementation(() => ({
      data: undefined,
      isPlaceholderData: false,
      isError: true,
      error: refused,
      refetch: vi.fn(),
    }));
    await renderForm();

    expect(screen.getByTestId('launch-config-error-title')).toHaveTextContent('The launchpad refused the quote.');
    expect(screen.getByTestId('launch-config-error')).toHaveTextContent(
      'Only $STONK launches are allowed on this launchpad (QUOTE_NOT_ALLOWED)',
    );
  });

  it('promises a later listing only after a retry that could not reach the tracker at all', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordLaunch.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    // First failure: still an error with a retry, even for a network failure.
    expect(screen.getByTestId('launch-record-failed')).toHaveTextContent('did not record it: Failed to fetch');

    fireEvent.click(screen.getByTestId('launch-record-retry'));
    await waitFor(() => expect(screen.getByTestId('launch-record-pending')).toBeInTheDocument());
    expect(screen.getByTestId('launch-record-pending')).toHaveTextContent('It will appear in Agents once it does.');
    expect(screen.getByTestId('launch-record-retry')).toBeInTheDocument();
  });

  it('names the existing agent on a 409 LAUNCH_EXISTS, links to it, and does not hand the orphan token on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordLaunch.mockRejectedValueOnce(new LaunchApiError('wallet already has a launch', 409, 'LAUNCH_EXISTS', 'MintOLD'));
    getLaunch.mockResolvedValueOnce({ mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST' });
    const onConfirmed = vi.fn();
    await renderForm({ onConfirmed });
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(getLaunch).toHaveBeenCalledWith('MintOLD');
    expect(screen.getByTestId('launch-record-exists')).toHaveTextContent('This wallet already has an agent: First Agent ($FIRST)');
    expect(screen.getByTestId('launch-record-exists-link')).toHaveAttribute('href', expect.stringMatching(EXISTING_HREF));
    expect(screen.getByTestId('launch-open-existing')).toHaveAttribute('href', expect.stringMatching(EXISTING_HREF));
    expect(screen.queryByTestId('launch-continue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-record-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-record-pending')).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('asks the tracker for the wallet’s launches before paying and refuses a second one', async () => {
    fetchLaunchesByWallet.mockResolvedValueOnce([
      { mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST', creator_wallet: wallet.publicKey },
    ]);
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-wallet-has-agent')).toBeInTheDocument());
    expect(fetchLaunchesByWallet).toHaveBeenCalledWith(wallet.publicKey);
    expect(screen.getByTestId('launch-wallet-has-agent')).toHaveTextContent('This wallet already has an agent: First Agent ($FIRST)');
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', expect.stringMatching(EXISTING_HREF));
    expect(screen.getByTestId('launch-action')).toBeDisabled();
    expect(uploadMetadata).not.toHaveBeenCalled();
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(recordLaunch).not.toHaveBeenCalled();
    expect(screen.getByTestId('launch-form')).toBeInTheDocument();
  });

  it('does not let a tracker outage on the wallet check block the launch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchLaunchesByWallet.mockRejectedValueOnce(new Error('tracker down'));
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(recordLaunch).toHaveBeenCalledTimes(1);
  });

  it('re-reads the config for the $STONK entry when the tracker defaults to another quote, and never offers a choice', async () => {
    const solDefault = {
      ...LAUNCH_CONFIG,
      quote: SOL_QUOTE,
      curve: { ...LAUNCH_CONFIG.curve, configId: SOL_QUOTE.launchlabConfigId },
    };
    useLaunchConfig.mockImplementation((mint?: string) => settled(mint === STONK_QUOTE.quoteMint ? LAUNCH_CONFIG : solDefault));
    await renderForm();

    await waitFor(() => expect(useLaunchConfig).toHaveBeenCalledWith(STONK_QUOTE.quoteMint));
    expect(screen.getByTestId('launch-summary')).toHaveTextContent('$STONK');
    expect(screen.getByTestId('launch-summary')).not.toHaveTextContent('$SOL');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('refuses to price a tracker that offers no $STONK quote', async () => {
    const solOnly = { ...LAUNCH_CONFIG, quote: SOL_QUOTE, quotes: [SOL_QUOTE] };
    useLaunchConfig.mockImplementation(() => settled(solOnly));
    await renderForm();

    expect(screen.getByTestId('launch-config-error')).toHaveTextContent('The launchpad has no $STONK quote.');
    expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument();
  });

  it("shows the wallet's own reason when Phantom cannot sign, not the connector wrapper", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inner = new Error('Phantom: Transaction reverted during simulation');
    const wrapper = Object.assign(new Error('Failed to sign transaction'), { code: 'SIGNING_FAILED', originalError: inner });
    wallet.sign.mockRejectedValueOnce(wrapper);
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Phantom could not sign: Phantom: Transaction reverted during simulation'),
    );
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(recordLaunch).not.toHaveBeenCalled();
  });

  it('shows a preflight refusal verbatim and never opens the wallet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refusal = Object.assign(new Error('The launch would fail on-chain: {"InstructionError":[3,"Custom"]}. Program log: x'), {
      name: 'LaunchPreflightError',
      kind: 'simulation',
    });
    prepareLaunch.mockRejectedValueOnce(refusal);
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The launch would fail on-chain:'));
    expect(wallet.sign).not.toHaveBeenCalled();
  });

  it('blocks the launch when the tracker cluster and the wallet network differ', async () => {
    useLaunchConfig.mockImplementation(() => settled(DEVNET_CONFIG));
    wallet.network = 'solana:mainnet';
    await renderForm();
    await fillForm();

    expect(screen.getByTestId('launch-cluster-mismatch')).toHaveTextContent(
      'This build talks to a devnet launchpad but the wallet is connected to mainnet.',
    );
    expect(screen.getByTestId('launch-action')).toBeDisabled();
    fireEvent.click(screen.getByTestId('launch-action'));
    expect(prepareLaunch).not.toHaveBeenCalled();
    wallet.network = 'solana:devnet';
  });

  it('treats mainnet-beta and solana:mainnet as the same place, and an unknown side as no mismatch', async () => {
    useLaunchConfig.mockImplementation(() => settled(MAINNET_BETA_CONFIG));
    wallet.network = 'solana:mainnet';
    await renderForm();
    expect(screen.queryByTestId('launch-cluster-mismatch')).not.toBeInTheDocument();

    wallet.network = null;
    useLaunchConfig.mockImplementation(() => settled(DEVNET_CONFIG));
    await renderForm();
    expect(screen.queryByTestId('launch-cluster-mismatch')).not.toBeInTheDocument();
    wallet.network = 'solana:devnet';
  });

  it('returns to the form with a readable error when the wallet rejects', async () => {
    wallet.sign.mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
    await renderForm();
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('You rejected the transaction in your wallet.'));
    expect(screen.getByTestId('launch-form')).toBeInTheDocument();
    expect(recordLaunch).not.toHaveBeenCalled();
  });

  it('skips the upload and the record on the mock path', async () => {
    isMockLaunch.mockReturnValue(true);
    prepareLaunch.mockResolvedValueOnce({
      transaction: null,
      mint: 'MockMint',
      poolId: 'MockPool',
      blockhash: '1',
      lastValidBlockHeight: 0,
      summary: { mock: true },
    });
    const onConfirmed = vi.fn();
    await renderForm({ onConfirmed });
    await fillForm();
    fireEvent.click(screen.getByTestId('launch-action'));

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeInTheDocument());
    expect(uploadMetadata).not.toHaveBeenCalled();
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(recordLaunch).not.toHaveBeenCalled();
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ mock: true, mint: 'MockMint' }));
    isMockLaunch.mockReturnValue(false);
  });
});
