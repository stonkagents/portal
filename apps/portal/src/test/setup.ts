/**
 * Purpose: Vitest global setup — extends matchers with jest-dom
 */
import '@testing-library/jest-dom/vitest';

// The suites model a build with the Network token configured, as dev and stg
// are (`lib/agent-token.ts` reads NEXT_PUBLIC_AGENT_MINT at import). A test of
// the unconfigured "coming soon" state stubs the key empty and re-imports.
if (process.env.NEXT_PUBLIC_AGENT_MINT === undefined) {
  process.env.NEXT_PUBLIC_AGENT_MINT = 'tRqrTWVmyZD7pqgu8jkBJodLyCKYJhC7Wbgi1MnT9gSr';
}

// jsdom does not implement <dialog>'s show/showModal/close (the Modal component
// drives them directly). Mirror the open attribute so queries and closes work.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; show?: () => void; close?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.show !== 'function') {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
