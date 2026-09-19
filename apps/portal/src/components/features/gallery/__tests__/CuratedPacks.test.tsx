/**
 * Purpose: Tests for CuratedPacks: tracker catalog only (skeleton, error, empty), item list on
 *          click, no invented install or size figures, dimmed when a type filter is active.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CuratedPacks } from '../CuratedPacks';
import type { TransformedPack } from '@/lib/api/transformers/gallery';

const packs: TransformedPack[] = [
  {
    id: 'pk1',
    icon: 'zap',
    color: 'green',
    title: 'Starter Pack',
    description: 'Desc',
    assets: 2,
    items: [
      { filename: 'web-search.claw-tool', type: 'claw-tool', title: 'Web Search', description: 'Search the web' },
      { filename: 'review.claw-skill', type: 'claw-skill', title: 'Code Review', description: 'Review code' },
    ],
  },
  { id: 'pk2', icon: 'bar-chart', color: 'blue', title: 'DeFi Pack', description: 'Desc', assets: 0, items: [] },
];

describe('CuratedPacks', () => {
  it('shows all packs when activeFilter is "All"', () => {
    render(<CuratedPacks packs={packs} activeFilter="All" />);
    expect(screen.getByText('Starter Pack')).toBeInTheDocument();
    expect(screen.getByText('DeFi Pack')).toBeInTheDocument();
  });

  it('shows all packs when activeFilter is undefined', () => {
    render(<CuratedPacks packs={packs} />);
    expect(screen.getByText('Starter Pack')).toBeInTheDocument();
    expect(screen.getByText('DeFi Pack')).toBeInTheDocument();
  });

  it('dims packs when a type filter is active', () => {
    render(<CuratedPacks packs={packs} activeFilter=".claw-workflow" />);
    expect(screen.getByTestId('pack-pk1').className).toContain('opacity-40');
    expect(screen.getByTestId('pack-pk2').className).toContain('opacity-40');
  });

  it('shows the item count and no install or size figures', () => {
    render(<CuratedPacks packs={packs} />);
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.queryByText(/installs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MB/)).not.toBeInTheDocument();
  });

  it('expands a pack to list its items with the user-facing type label', () => {
    render(<CuratedPacks packs={packs} />);
    expect(screen.queryByTestId('pack-items-pk1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    const list = screen.getByTestId('pack-items-pk1');
    expect(list).toHaveTextContent('Web Search');
    expect(list).toHaveTextContent('Code Review');
    expect(list).toHaveTextContent('.agent-tool');
    expect(screen.getByTestId('pack-toggle-pk1')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByTestId('pack-toggle-pk1'));
    expect(screen.queryByTestId('pack-items-pk1')).not.toBeInTheDocument();
  });

  it('renders a skeleton while the catalog loads', () => {
    render(<CuratedPacks packs={[]} loading />);
    expect(screen.getAllByTestId('pack-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('packs-empty')).not.toBeInTheDocument();
  });

  it('renders a note when the catalog failed, and an empty state when it is empty', () => {
    const { rerender } = render(<CuratedPacks packs={[]} error />);
    expect(screen.getByTestId('packs-error')).toBeInTheDocument();

    rerender(<CuratedPacks packs={[]} />);
    expect(screen.getByTestId('packs-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('packs-error')).not.toBeInTheDocument();
  });
});
