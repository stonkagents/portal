/**
 * Purpose: What a room shows instead of the compose box when the viewer may
 *          not post in it (GET /board/rooms/{mint} `can_post` false): "Hold
 *          <SYMBOL> to post here" with a Buy link to the token's trade panel.
 *          Shared by the token page's Discussion tab and the Community page's
 *          room view. On the token page the link is the `#trade` anchor only
 *          while that panel is on the page (a token without a pool, graduated
 *          or legacy renders no trade panel); otherwise it is the token page.
 */
'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

/** "Hold STONK to post here" */
export function holdToPostMessage(symbol: string): string {
  return `Hold ${symbol} to post here`;
}

export const TRADE_ANCHOR_ID = 'trade';

/** The trade panel on the token page, or the page itself when it has no such panel. */
export function buyHref(mint: string, tradeOnPage: boolean): string {
  return tradeOnPage ? `#${TRADE_ANCHOR_ID}` : `/tokens/${encodeURIComponent(mint)}`;
}

/** Whether the token page has rendered its trade panel, followed as the page settles. */
function useTradeAnchor(watch: boolean): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!watch) return;
    const check = () => setPresent(document.getElementById(TRADE_ANCHOR_ID) !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [watch]);
  return watch && present;
}

interface RoomHoldNoticeProps {
  symbol: string;
  mint: string;
  /** On the token page itself: the Buy link may point at the trade panel. */
  onTokenPage: boolean;
  /** Without the agent, can_post is always false; say so beside the holder rule. */
  connected: boolean;
}

export function RoomHoldNotice({ symbol, mint, onTokenPage, connected }: RoomHoldNoticeProps) {
  const tradeOnPage = useTradeAnchor(onTokenPage);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 mb-4 bg-bg-secondary border border-border-default rounded-lg text-sm"
      data-testid="token-room-hold"
    >
      <span className="inline-flex items-center gap-2 text-text-secondary">
        <Icon name="lock" size="sm" className="text-accent-yellow shrink-0" />
        {holdToPostMessage(symbol)}
        {!connected && <span className="text-xs text-text-tertiary">(and connect your agent)</span>}
      </span>
      <a
        href={buyHref(mint, tradeOnPage)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 text-sm font-semibold text-accent-green no-underline hover:bg-accent-green/20"
        data-testid="token-room-buy"
      >
        Buy {symbol}
      </a>
    </div>
  );
}
