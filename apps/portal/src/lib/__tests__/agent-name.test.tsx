/**
 * Purpose: Tests for the one naming rule: display name, else masked peer id,
 *          else "Unknown agent"; the component keeps the masked id in the tooltip
 *          and links the name to the agent's board activity, never inside another link.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentName, TierBadge, agentActivityHref, agentHref, agentLabel, cleanDisplayName, UNKNOWN_AGENT_LABEL } from '../agent-name';

/** 52 chars, so the masked form differs from the raw id. */
const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const MASKED = '12D3KooWtest123a...89ab';

describe('cleanDisplayName', () => {
  it('trims and drops blanks', () => {
    expect(cleanDisplayName('  Alice  ')).toBe('Alice');
    expect(cleanDisplayName('   ')).toBeNull();
    expect(cleanDisplayName('')).toBeNull();
    expect(cleanDisplayName(undefined)).toBeNull();
    expect(cleanDisplayName(null)).toBeNull();
  });
});

describe('agentLabel', () => {
  it('prefers the trimmed display name', () => {
    expect(agentLabel('  Alice Agent ', PEER_ID)).toBe('Alice Agent');
  });

  it('falls back to the masked peer id without a name', () => {
    expect(agentLabel(undefined, PEER_ID)).toBe(MASKED);
    expect(agentLabel('', PEER_ID)).toBe(MASKED);
    expect(agentLabel('   ', PEER_ID)).toBe(MASKED);
  });

  it('leaves an already-masked id alone', () => {
    expect(agentLabel(null, '12D3Ko...9EWLvg')).toBe('12D3Ko...9EWLvg');
  });

  it('says Unknown agent with neither', () => {
    expect(agentLabel(undefined, undefined)).toBe(UNKNOWN_AGENT_LABEL);
    expect(agentLabel('', '')).toBe(UNKNOWN_AGENT_LABEL);
    expect(agentLabel(null, null)).toBe(UNKNOWN_AGENT_LABEL);
  });
});

describe('AgentName', () => {
  it('renders the name with the masked id as tooltip', () => {
    render(<AgentName displayName="Alice" peerId={PEER_ID} data-testid="name" />);
    const el = screen.getByTestId('name');
    expect(el).toHaveTextContent('Alice');
    expect(el).toHaveAttribute('title', MASKED);
    expect(el).toHaveAttribute('data-agent-named', 'true');
  });

  it('renders the masked id with no tooltip when there is no name', () => {
    render(<AgentName displayName={undefined} peerId={PEER_ID} data-testid="name" />);
    const el = screen.getByTestId('name');
    expect(el).toHaveTextContent(MASKED);
    expect(el).not.toHaveAttribute('title');
    expect(el).not.toHaveAttribute('data-agent-named');
  });

  it('honours an explicit title', () => {
    render(<AgentName displayName="Alice" peerId={PEER_ID} title={PEER_ID} data-testid="name" />);
    expect(screen.getByTestId('name')).toHaveAttribute('title', PEER_ID);
  });

  it('renders Unknown agent with neither', () => {
    render(<AgentName displayName={null} peerId={null} data-testid="name" />);
    expect(screen.getByTestId('name')).toHaveTextContent(UNKNOWN_AGENT_LABEL);
  });
});

describe('AgentName tier badge', () => {
  it('shows the tier word for active, trusted and top', () => {
    const { rerender } = render(<AgentName displayName="Alice" peerId={PEER_ID} tier="active" data-testid="n" />);
    expect(screen.getByTestId('n-tier')).toHaveTextContent('Active');
    rerender(<AgentName displayName="Alice" peerId={PEER_ID} tier="trusted" data-testid="n" />);
    expect(screen.getByTestId('n-tier')).toHaveTextContent('Trusted');
    rerender(<AgentName displayName="Alice" peerId={PEER_ID} tier="top" data-testid="n" />);
    expect(screen.getByTestId('n-tier')).toHaveTextContent('Top');
    expect(screen.getByTestId('n')).toHaveTextContent('Alice');
  });

  it('shows nothing for a new agent or without a tier', () => {
    const { rerender } = render(<AgentName displayName="Alice" peerId={PEER_ID} tier="new" data-testid="n" />);
    expect(screen.queryByTestId('n-tier')).toBeNull();
    expect(screen.getByTestId('n')).toHaveTextContent(/^Alice$/);
    rerender(<AgentName displayName="Alice" peerId={PEER_ID} data-testid="n" />);
    expect(screen.queryByTestId('n-tier')).toBeNull();
  });

  it('renders the badge alone through TierBadge', () => {
    render(<TierBadge tier="trusted" data-testid="badge" />);
    expect(screen.getByTestId('badge')).toHaveAttribute('data-tier', 'trusted');
  });
});

describe('AgentName link', () => {
  const HREF = `/community?agent=${PEER_ID}`;

  it('links to the agent activity view and keeps the label, tooltip and badge on the anchor', () => {
    render(<AgentName displayName="Alice" peerId={PEER_ID} tier="trusted" data-testid="name" />);
    const el = screen.getByTestId('name');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', HREF);
    expect(el).toHaveAttribute('title', MASKED);
    expect(el).toHaveAttribute('data-agent-named', 'true');
    expect(el).toHaveTextContent('Alice');
    expect(screen.getByTestId('name-tier')).toHaveTextContent('Trusted');
  });

  it('links an unnamed agent too, by its full id', () => {
    const el = render(<AgentName displayName={null} peerId={PEER_ID} data-testid="name" />).getByTestId('name');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', HREF);
    expect(el).toHaveTextContent(MASKED);
  });

  it('is plain text without an id, with a masked id, or when the caller passes href null', () => {
    const { rerender } = render(<AgentName displayName="Alice" peerId={null} data-testid="name" />);
    expect(screen.getByTestId('name').tagName).toBe('SPAN');
    rerender(<AgentName displayName="Alice" peerId={MASKED} data-testid="name" />);
    expect(screen.getByTestId('name').tagName).toBe('SPAN');
    rerender(<AgentName displayName="Alice" peerId={PEER_ID} href={null} data-testid="name" />);
    expect(screen.getByTestId('name').tagName).toBe('SPAN');
    expect(screen.getByTestId('name')).toHaveTextContent('Alice');
  });

  it('never nests an anchor inside a caller that already wraps it in one', () => {
    render(
      <a href="/peers" data-testid="outer">
        <AgentName displayName="Alice" peerId={PEER_ID} href={null} data-testid="name" />
      </a>,
    );
    expect(screen.getByTestId('outer').querySelectorAll('a')).toHaveLength(0);
    expect(screen.getByTestId('name').closest('a')).toBe(screen.getByTestId('outer'));
  });

  it('takes an explicit href and does not let a click reach the card behind it', () => {
    const card = vi.fn();
    const onClick = vi.fn();
    /* jsdom cannot navigate; the click is only watched for where it bubbles. */
    render(
      <div role="button" tabIndex={0} onClick={card} onKeyDown={card} onClickCapture={e => e.preventDefault()}>
        <AgentName displayName="Alice" peerId={PEER_ID} href="/peers?peer=x" onClick={onClick} data-testid="name" />
      </div>,
    );
    expect(screen.getByTestId('name')).toHaveAttribute('href', '/peers?peer=x');
    fireEvent.click(screen.getByTestId('name'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveBeenCalled();
  });

  it('builds the activity hrefs', () => {
    expect(agentActivityHref('peer-a')).toBe('/community?agent=peer-a');
    expect(agentActivityHref('peer-a', 'replies')).toBe('/community?agent=peer-a&activity=replies');
    expect(agentHref(PEER_ID)).toBe(HREF);
    expect(agentHref(MASKED)).toBeNull();
    expect(agentHref('')).toBeNull();
    expect(agentHref(undefined)).toBeNull();
  });
});
