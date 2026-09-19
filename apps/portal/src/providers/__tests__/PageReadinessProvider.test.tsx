/**
 * Purpose: Tests for PageReadinessProvider — key registration, reporting, and readiness
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { PageReadinessProvider, usePageReadiness } from '../PageReadinessProvider';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(PageReadinessProvider, null, children);
}

describe('PageReadinessProvider', () => {
  it('isPageReady is false before baseline key is reported', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });
    expect(result.current.isPageReady).toBe(false);
  });

  it('isPageReady becomes true when baseline key (layout-mounted) is reported', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });

    act(() => {
      result.current.reportReady('layout-mounted');
    });

    expect(result.current.isPageReady).toBe(true);
  });

  it('isPageReady stays false when a required key is registered but not reported', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });

    act(() => {
      result.current.requireKey('network-map-loaded');
      result.current.reportReady('layout-mounted');
    });

    expect(result.current.isPageReady).toBe(false);
  });

  it('isPageReady becomes true when all required keys are reported', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });

    act(() => {
      result.current.requireKey('network-map-loaded');
      result.current.reportReady('layout-mounted');
      result.current.reportReady('network-map-loaded');
    });

    expect(result.current.isPageReady).toBe(true);
  });

  it('duplicate requireKey and reportReady calls are idempotent', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });

    act(() => {
      result.current.requireKey('x');
      result.current.requireKey('x');
      result.current.reportReady('layout-mounted');
      result.current.reportReady('layout-mounted');
      result.current.reportReady('x');
      result.current.reportReady('x');
    });

    expect(result.current.isPageReady).toBe(true);
  });

  it('multiple dynamic keys all need to be reported', () => {
    const { result } = renderHook(() => usePageReadiness(), { wrapper });

    act(() => {
      result.current.requireKey('a');
      result.current.requireKey('b');
      result.current.reportReady('layout-mounted');
      result.current.reportReady('a');
    });

    expect(result.current.isPageReady).toBe(false);

    act(() => {
      result.current.reportReady('b');
    });

    expect(result.current.isPageReady).toBe(true);
  });
});
