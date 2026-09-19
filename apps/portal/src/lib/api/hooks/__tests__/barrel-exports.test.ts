/**
 * Purpose: Verify all transfer hooks are exported from the barrel index
 */
import { describe, it, expect } from 'vitest';

describe('hooks barrel exports — transfer hooks', () => {
  it('exports useCancelTransfer', async () => {
    const mod = await import('../index');
    expect(mod.useCancelTransfer).toBeDefined();
  });
  it('exports useRetryTransfer', async () => {
    const mod = await import('../index');
    expect(mod.useRetryTransfer).toBeDefined();
  });
  it('exports useTransferHistory', async () => {
    const mod = await import('../index');
    expect(mod.useTransferHistory).toBeDefined();
  });
  it('exports useLibrary', async () => {
    const mod = await import('../index');
    expect(mod.useLibrary).toBeDefined();
  });
});
