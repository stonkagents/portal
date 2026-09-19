import { describe, it, expect } from 'vitest';
import { KNOWN_WALLETS, walletsNotInstalled } from '../wallet-catalog';

const PAGE = 'https://dev.stonkagents.com/tokens/abc?x=1';

describe('wallet catalog', () => {
  it('deep-links into each wallet browser with the page and the origin as ref', () => {
    const by = Object.fromEntries(KNOWN_WALLETS.map(w => [w.slug, w]));
    expect(by.phantom.browseUrl(PAGE)).toBe(
      `https://phantom.app/ul/browse/${encodeURIComponent(PAGE)}?ref=${encodeURIComponent('https://dev.stonkagents.com')}`,
    );
    expect(by.solflare.browseUrl(PAGE)).toBe(
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(PAGE)}?ref=${encodeURIComponent('https://dev.stonkagents.com')}`,
    );
    expect(by.backpack.browseUrl(PAGE)).toContain('https://backpack.app/ul/v1/browse/');
    expect(by.metamask.browseUrl(PAGE)).toBe('https://metamask.app.link/dapp/dev.stonkagents.com/tokens/abc?x=1');
  });

  it('drops wallets a ready connector already represents', () => {
    const left = walletsNotInstalled(['wallet-standard:phantom', 'Phantom', 'MetaMask']);
    expect(left.map(w => w.slug)).toEqual(['solflare', 'backpack']);
  });

  it('offers every known wallet when nothing is installed', () => {
    expect(walletsNotInstalled([]).map(w => w.slug)).toEqual(['phantom', 'solflare', 'backpack', 'metamask']);
  });
});
