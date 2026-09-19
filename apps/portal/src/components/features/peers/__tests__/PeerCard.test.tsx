/**
 * Purpose: Tests for PeerCard trust/block action buttons
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeerCard } from '../PeerCard';

const baseProps = {
  displayName: 'AlphaAgent',
  agentId: '12D3KooW...abc',
  connectionType: 'direct' as const,
  country: 'US',
  latency: 42,
  reputation: 7.5,
  bandwidthUp: 100,
  bandwidthDown: 50,
  transfers: [],
};

describe('PeerCard trust/block actions', () => {
  it('renders trust button when onTrust provided', () => {
    render(<PeerCard {...baseProps} onTrust={vi.fn()} />);
    expect(screen.getByTestId('peer-trust-AlphaAgent')).toBeTruthy();
  });

  it('renders block button when onBlock provided', () => {
    render(<PeerCard {...baseProps} onBlock={vi.fn()} />);
    expect(screen.getByTestId('peer-block-AlphaAgent')).toBeTruthy();
  });

  it('does not render trust button when onTrust not provided', () => {
    render(<PeerCard {...baseProps} />);
    expect(screen.queryByTestId('peer-trust-AlphaAgent')).toBeNull();
  });

  it('does not render block button when onBlock not provided', () => {
    render(<PeerCard {...baseProps} />);
    expect(screen.queryByTestId('peer-block-AlphaAgent')).toBeNull();
  });

  it('calls onTrust with no args when trust button clicked', () => {
    const onTrust = vi.fn();
    render(<PeerCard {...baseProps} onTrust={onTrust} />);
    fireEvent.click(screen.getByTestId('peer-trust-AlphaAgent'));
    expect(onTrust).toHaveBeenCalledOnce();
  });

  it('calls onBlock with no args when block button clicked', () => {
    const onBlock = vi.fn();
    render(<PeerCard {...baseProps} onBlock={onBlock} />);
    fireEvent.click(screen.getByTestId('peer-block-AlphaAgent'));
    expect(onBlock).toHaveBeenCalledOnce();
  });

  it('trust click does not trigger card onClick', () => {
    const onClick = vi.fn();
    const onTrust = vi.fn();
    render(<PeerCard {...baseProps} onClick={onClick} onTrust={onTrust} />);
    fireEvent.click(screen.getByTestId('peer-trust-AlphaAgent'));
    expect(onTrust).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows trusted indicator when trusted prop is true', () => {
    render(<PeerCard {...baseProps} trusted />);
    expect(screen.getByTestId('peer-trusted-badge')).toBeTruthy();
  });
});
