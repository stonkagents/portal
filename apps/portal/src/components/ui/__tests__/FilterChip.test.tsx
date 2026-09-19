/**
 * Purpose: TDD test for FilterChip — focus-visible accessibility
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterChip } from '../FilterChip';

describe('FilterChip focus-visible', () => {
  it('has focus-visible outline classes for keyboard accessibility', () => {
    render(<FilterChip label="Test" onClick={vi.fn()} />);
    const button = screen.getByTestId('filter-chip');
    const classes = button.className;
    expect(classes).toContain('focus-visible:outline-2');
    expect(classes).toContain('focus-visible:outline-accent-green');
  });
});
