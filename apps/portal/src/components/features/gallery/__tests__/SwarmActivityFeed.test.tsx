/**
 * Purpose: Tests for SwarmActivityFeed — empty state, items, and rich text formatting
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SwarmActivityFeed } from '../SwarmActivityFeed';

describe('SwarmActivityFeed', () => {
  it('shows empty state message when items array is empty', () => {
    render(<SwarmActivityFeed items={[]} />);
    expect(screen.getByText('No recent activity')).toBeDefined();
  });

  it('renders items when provided', () => {
    const items = [
      { id: 'a1', text: 'file.vec shared', time: '2s ago', color: 'green' as const },
      { id: 'a2', text: 'data.traj installed', time: '5s ago', color: 'blue' as const },
    ];
    render(<SwarmActivityFeed items={items} />);
    expect(screen.getByTestId('activity-a1')).toBeDefined();
    expect(screen.getByTestId('activity-a2')).toBeDefined();
    expect(screen.queryByText('No recent activity')).toBeNull();
  });

  it('renders peer names (agent-XXXX) as bold colored text', () => {
    const items = [
      { id: 'r1', text: 'agent-7xKd synced a file', time: '2s ago', color: 'green' as const },
    ];
    render(<SwarmActivityFeed items={items} />);
    const row = screen.getByTestId('activity-r1');
    const bold = row.querySelector('strong');
    expect(bold).not.toBeNull();
    expect(bold!.textContent).toBe('agent-7xKd');
    expect(bold!.className).toContain('text-accent-green');
  });

  it('renders filenames with known extensions as colored text', () => {
    const items = [
      { id: 'r2', text: 'agent-p5Fz shared incident-response.traj', time: '8s ago', color: 'blue' as const },
    ];
    render(<SwarmActivityFeed items={items} />);
    const row = screen.getByTestId('activity-r2');
    const spans = row.querySelectorAll('span.text-accent-blue');
    const fileSpan = Array.from(spans).find(s => s.textContent === 'incident-response.traj');
    expect(fileSpan).toBeDefined();
    expect(fileSpan!.textContent).toBe('incident-response.traj');
  });

  it('uses item color for highlights — yellow item highlights in yellow', () => {
    const items = [
      { id: 'r3', text: 'agent-a8Bf installed defi-market-context.vec', time: '23s ago', color: 'yellow' as const },
    ];
    render(<SwarmActivityFeed items={items} />);
    const row = screen.getByTestId('activity-r3');
    const bold = row.querySelector('strong');
    expect(bold!.className).toContain('text-accent-yellow');
  });

  it('leaves plain text unstyled when no agent- or filename patterns found', () => {
    const items = [
      { id: 'r4', text: 'New peer joined from Tokyo', time: '14s ago', color: 'green' as const },
    ];
    render(<SwarmActivityFeed items={items} />);
    const row = screen.getByTestId('activity-r4');
    // No <strong> for agent- pattern, no colored span for file extension
    const bold = row.querySelector('strong');
    expect(bold).toBeNull();
  });
});
