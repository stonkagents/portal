/**
 * Purpose: Country resolution from the shapes the tracker and mock data actually send.
 */
import { describe, expect, it } from 'vitest';
import { countPeersByCountry, countryName, resolveCountryId } from '../country-codes';

describe('resolveCountryId', () => {
  it('resolves ISO alpha-2 from the tracker GeoIP field, any case', () => {
    expect(resolveCountryId({ country: 'US' })).toBe('840');
    expect(resolveCountryId({ country: 'de' })).toBe('276');
  });

  it('resolves "City, CC" strings and the UK alias used by mock data', () => {
    expect(resolveCountryId({ country: 'San Francisco, US' })).toBe('840');
    expect(resolveCountryId({ country: 'London, UK' })).toBe('826');
  });

  it('is unknown for the stub GeoIP resolver output, private networks and free text', () => {
    expect(resolveCountryId({ country: '' })).toBeNull();
    expect(resolveCountryId({})).toBeNull();
    expect(resolveCountryId({ country: 'Local Network' })).toBeNull();
    expect(resolveCountryId({ country: 'Somewhere' })).toBeNull();
  });
});

describe('countPeersByCountry', () => {
  it('counts active peers per country, keeps unknown ones, and floors the scale at 10', () => {
    const counts = countPeersByCountry([
      { status: 'online', country: 'US' },
      { status: 'seeding', country: 'us' },
      { status: 'offline', country: 'US' },
      { status: 'leeching', country: 'Berlin, DE' },
      { status: 'online', country: '' },
    ]);
    expect(counts.byCountry).toEqual({ '840': 2, '276': 1 });
    expect(counts.unknown).toBe(1);
    expect(counts.scaleMax).toBe(10);
  });

  it('raises the scale to the busiest country', () => {
    const peers = Array.from({ length: 14 }, () => ({ status: 'online', country: 'JP' }));
    expect(countPeersByCountry(peers).scaleMax).toBe(14);
  });
});

describe('countryName', () => {
  it('names a world-atlas id from the engine region table', () => {
    expect(countryName('840')).toBe('United States');
    expect(countryName('276')).toBe('Germany');
  });

  it('never throws for an id outside the table', () => {
    expect(countryName('000')).toBe('Unknown');
  });
});
