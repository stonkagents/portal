import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LaunchResult } from '@/components/features/launch';
import { STONK_QUOTE } from '@/lib/launchlab/__fixtures__/launch-config';

const RESULT: LaunchResult = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  txSignature: 'sig123',
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: 'https://gateway.example/ipfs/img',
  imageThumbUrl: 'https://gateway.example/ipfs/thumb',
  metadataUri: 'https://gateway.example/ipfs/meta',
  quote: STONK_QUOTE,
  quoteSymbol: 'STONK',
  holderTaxBps: 100,
  devBuy: 0,
  feeLamports: 4901732,
  programId: 'DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6',
  recorded: true,
  mock: false,
};

vi.mock('@/components/features/launch', () => ({
  LaunchForm: ({
    onLaunched,
    onConfirmed,
    existingSymbols,
  }: {
    onLaunched: (r: LaunchResult) => void;
    onConfirmed?: (r: LaunchResult) => void;
    existingSymbols?: string[];
  }) => (
    <div data-testid="launch-form-stub" data-symbols={(existingSymbols ?? []).join(',')}>
      <button type="button" onClick={() => onConfirmed?.(RESULT)}>
        confirm
      </button>
      <button type="button" onClick={() => onLaunched(RESULT)}>
        continue
      </button>
    </div>
  ),
}));

import { TokenWizard, toLaunchedToken } from '../TokenWizard';

describe('toLaunchedToken', () => {
  it('maps the launch result to the shape the profile stores', () => {
    expect(toLaunchedToken(RESULT)).toEqual({
      name: 'Signal Hound',
      ticker: 'HOUND',
      imageDataUrl: null,
      contractAddr: 'MintAAA',
      imageUrl: 'https://gateway.example/ipfs/img',
      imageThumbUrl: 'https://gateway.example/ipfs/thumb',
      poolId: 'PoolAAA',
      quoteMint: STONK_QUOTE.quoteMint,
      quoteSymbol: 'STONK',
      txSignature: 'sig123',
      metadataUri: 'https://gateway.example/ipfs/meta',
    });
  });
});

describe('TokenWizard', () => {
  it('renders the launch form in a modal and passes the known symbols through', () => {
    render(<TokenWizard onClose={vi.fn()} existingSymbols={['A', 'B']} />);
    expect(screen.getByTestId('token-wizard')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Launch Agent');
    expect(screen.queryByText(/Step 1 of 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/quote you pick/)).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-form-stub')).toHaveAttribute('data-symbols', 'A,B');
    expect(screen.queryByText(/pump\.fun/i)).not.toBeInTheDocument();
  });

  it('closes with nothing when the creator leaves before launching', () => {
    const onClose = vi.fn();
    render(<TokenWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('tw-close'));
    expect(onClose).toHaveBeenCalledWith(undefined);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenLastCalledWith(undefined);
  });

  it('hands the launch on when the creator continues', () => {
    const onClose = vi.fn();
    const onLaunched = vi.fn();
    render(<TokenWizard onClose={onClose} onLaunched={onLaunched} />);
    fireEvent.click(screen.getByText('continue'));
    expect(onLaunched).toHaveBeenCalledWith(RESULT);
    expect(onClose).toHaveBeenCalledWith(toLaunchedToken(RESULT));
  });

  it('still carries a confirmed launch when the modal is closed from the success screen', () => {
    const onClose = vi.fn();
    render(<TokenWizard onClose={onClose} />);
    fireEvent.click(screen.getByText('confirm'));
    fireEvent.click(screen.getByTestId('tw-close'));
    expect(onClose).toHaveBeenCalledWith(toLaunchedToken(RESULT));
  });

  it('locks body scroll while open and restores it', () => {
    const { unmount } = render(<TokenWizard onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
