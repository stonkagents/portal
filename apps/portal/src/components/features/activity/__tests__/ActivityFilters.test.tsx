/**
 * Purpose: Tests for ActivityFilters — category dropdown, triage filter,
 *          and show-agent-handled toggle.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityFilters } from '../ActivityFilters';
import type { EventCategory, EventTriage } from '@/lib/types/claw-event';

interface FilterState {
  category: EventCategory | 'all';
  triage: EventTriage | 'all';
  showSilent: boolean;
  search: string;
}

const defaultFilters: FilterState = {
  category: 'all',
  triage: 'all',
  showSilent: false,
  search: '',
};

describe('ActivityFilters', () => {
  it('renders the filter bar', () => {
    render(<ActivityFilters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.getByTestId('activity-filters')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<ActivityFilters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.getByTestId('activity-search')).toBeInTheDocument();
  });

  it('calls onChange with updated search value', () => {
    const onChange = vi.fn();
    render(<ActivityFilters filters={defaultFilters} onChange={onChange} />);
    const input = screen.getByTestId('activity-search');
    fireEvent.change(input, { target: { value: 'config' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, search: 'config' });
  });

  it('renders the category select', () => {
    render(<ActivityFilters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.getByTestId('activity-filter-category')).toBeInTheDocument();
  });

  it('calls onChange when category changes', () => {
    const onChange = vi.fn();
    render(<ActivityFilters filters={defaultFilters} onChange={onChange} />);
    const select = screen.getByTestId('activity-filter-category');
    fireEvent.change(select, { target: { value: 'security' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, category: 'security' });
  });

  it('renders the show-silent toggle', () => {
    render(<ActivityFilters filters={defaultFilters} onChange={vi.fn()} />);
    expect(screen.getByTestId('activity-toggle-silent')).toBeInTheDocument();
  });

  it('calls onChange when show-silent is toggled', () => {
    const onChange = vi.fn();
    render(<ActivityFilters filters={defaultFilters} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('activity-toggle-silent'));
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, showSilent: true });
  });
});
