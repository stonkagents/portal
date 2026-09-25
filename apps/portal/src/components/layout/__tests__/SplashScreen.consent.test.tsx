/**
 * Purpose: entering the site is consent. The splash's consent box is ticked by default so Enter
 *          works at once; unticking it disables Enter; the legal links open in a new tab so the
 *          overlay is never navigated away from; and entering starts the countdown.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/providers/PageReadinessProvider', () => ({
  usePageReadiness: () => ({ isPageReady: true, reportReady: vi.fn() }),
}));

import { SplashScreen } from '../SplashScreen';

describe('SplashScreen consent', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // The countdown schedules itself with requestAnimationFrame; a stub that ran the callback
    // synchronously would recurse until the stack overflowed. Starting the countdown is what
    // these tests observe, and that happens before the first frame, so frames never run.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('is ticked by default so Enter is enabled, and unticking disables Enter', () => {
    render(<SplashScreen />);
    const box = screen.getByTestId('splash-consent-checkbox') as HTMLInputElement;
    const enter = screen.getByTestId('splash-fix-btn') as HTMLButtonElement;

    expect(box.checked).toBe(true);
    expect(enter.disabled).toBe(false);
    expect(screen.getByTestId('splash-consent').textContent).toMatch(
      /By clicking Enter, you agree to the Terms and Conditions, Privacy Policy, and certify that you are over 18 years old\./,
    );

    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(enter.disabled).toBe(true);

    // A click on the disabled button does nothing: still the welcome copy, no countdown.
    fireEvent.click(enter);
    expect(screen.getByTestId('splash-subline')).toBeTruthy();

    fireEvent.click(box);
    expect(enter.disabled).toBe(false);
  });

  it('links to the legal pages in a new tab', () => {
    render(<SplashScreen />);
    const terms = screen.getByTestId('splash-consent-terms') as HTMLAnchorElement;
    const privacy = screen.getByTestId('splash-consent-privacy') as HTMLAnchorElement;
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(privacy.getAttribute('href')).toBe('/privacy');
    for (const a of [terms, privacy]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    expect(terms.textContent).toBe('Terms and Conditions');
    expect(privacy.textContent).toBe('Privacy Policy');
  });

  it('entering starts the countdown and hides the consent box', () => {
    render(<SplashScreen />);
    fireEvent.click(screen.getByTestId('splash-fix-btn'));
    expect(screen.queryByTestId('splash-consent')).toBeNull();
    expect(screen.queryByTestId('splash-fix-btn')).toBeNull();
    expect(screen.getByText(/Joining the Network/)).toBeTruthy();
  });

  it('does not render at all once the splash has been seen', () => {
    sessionStorage.setItem('stonkagents-splash-seen', '1');
    render(<SplashScreen />);
    expect(screen.queryByTestId('splash-screen')).toBeNull();
  });
});
