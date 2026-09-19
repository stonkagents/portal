/**
 * Candles + volume on lightweight-charts, drawn the way the token terminal's
 * chart card draws them: transparent canvas, grid on the border colour, up /
 * down candles on the accent green / red, the volume histogram on its own
 * hidden scale under the candles, mono axis text and subscript-zero prices.
 *
 * The library is loaded in an effect, so the static export never touches it.
 * Candles come in ready-made (`buildCandles`); this component only renders
 * them. It reads its colours off the theme's CSS variables and watches the
 * root element so a theme flip repaints the canvas.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../_lib/candles';
import { bodyRange, compact, subZero } from './chart-card';

interface TokenCandleChartProps {
  candles: Candle[];
  /** The interval the candles are bucketed on; a change refits the visible range. */
  interval: string;
  /** Prefix on every price: '$' or 'STONK '. */
  mark: string;
  /** Unit under the hovered candle's volume, e.g. the quote symbol. */
  volumeUnit?: string | null;
}

type ChartColors = { up: string; dn: string; ink: string; line: string; accent: string };

type ChartHandle = {
  remove: () => void;
  setData: (candles: Candle[]) => void;
  /** Fit the visible range to the newest candles. */
  fit: (count: number) => void;
};

/** The theme's chart colours, read off `el` so an ancestor override wins. */
function chartColors(el: HTMLElement): ChartColors {
  const css = getComputedStyle(el);
  const v = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  return {
    up: v('--color-accent-green', '#2ebd85'),
    dn: v('--color-accent-red', '#e24b4a'),
    ink: v('--color-text-secondary', '#9aa3b2'),
    line: v('--color-border-default', '#1e2430'),
    accent: v('--color-accent-green', '#28d17c'),
  };
}

function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
}

async function mountChart(el: HTMLDivElement, onHover: (candle: Candle | null) => void): Promise<ChartHandle> {
  const lib = await import('lightweight-charts');
  let col = chartColors(el);
  let rows: Candle[] = [];

  const chart: IChartApi = lib.createChart(el, {
    autoSize: true,
    layout: {
      background: { type: lib.ColorType.Solid, color: 'transparent' },
      textColor: col.ink,
      fontFamily: getComputedStyle(el).getPropertyValue('--font-mono').trim() || 'ui-monospace, Menlo, monospace',
      fontSize: 10,
      attributionLogo: true,
    },
    grid: { vertLines: { color: col.line }, horzLines: { color: col.line } },
    rightPriceScale: { borderVisible: false },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      barSpacing: 10,
      minBarSpacing: 2,
      maxBarSpacing: 18,
      rightOffset: 2,
    },
    crosshair: { mode: lib.CrosshairMode.Normal },
    localization: { priceFormatter: (v: number) => subZero(v) },
  });

  const candles: ISeriesApi<'Candlestick'> = chart.addSeries(lib.CandlestickSeries, {
    upColor: col.up,
    downColor: col.dn,
    borderVisible: false,
    wickUpColor: col.up,
    wickDownColor: col.dn,
    priceLineColor: col.accent,
    priceLineStyle: lib.LineStyle.Dashed,
    priceFormat: { type: 'custom', formatter: (v: number) => subZero(v), minMove: 1e-12 },
    autoscaleInfoProvider: () => {
      if (rows.length === 0) return null;
      const vr = chart.timeScale().getVisibleRange();
      const vis = vr ? rows.filter(c => c.time >= (vr.from as number) && c.time <= (vr.to as number)) : rows;
      const r = bodyRange(vis.length ? vis : rows);
      return r ? { priceRange: { minValue: r.min, maxValue: r.max } } : null;
    },
  });
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });

  const vol: ISeriesApi<'Histogram'> = chart.addSeries(lib.HistogramSeries, {
    priceScaleId: 'vol',
    priceFormat: { type: 'volume' },
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

  let hoverT: number | null = null;
  chart.subscribeCrosshairMove(param => {
    const t = param.time == null ? null : (param.time as number);
    if (t === hoverT) return;
    hoverT = t;
    onHover(t === null ? null : (rows.find(c => c.time === t) ?? null));
  });

  const setVolume = () => {
    vol.setData(
      rows.map(c => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? withAlpha(col.up, '55') : withAlpha(col.dn, '55'),
      })),
    );
  };

  // A theme flip changes the variables, not the canvas: repaint on the root's class / data-theme.
  const themeWatch =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          col = chartColors(el);
          chart.applyOptions({
            layout: { textColor: col.ink },
            grid: { vertLines: { color: col.line }, horzLines: { color: col.line } },
          });
          candles.applyOptions({
            upColor: col.up,
            downColor: col.dn,
            wickUpColor: col.up,
            wickDownColor: col.dn,
            priceLineColor: col.accent,
          });
          setVolume();
        })
      : null;
  themeWatch?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  return {
    remove: () => {
      themeWatch?.disconnect();
      chart.remove();
    },
    setData: next => {
      rows = next;
      candles.setData(rows.map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
      setVolume();
    },
    fit: count => {
      const ts = chart.timeScale();
      if (rows.length > count) ts.setVisibleLogicalRange({ from: rows.length - count, to: rows.length + 3 });
      else ts.fitContent();
    },
  };
}

/** Candles kept in view when an interval is picked; the rest scroll. */
const VISIBLE_CANDLES = 60;

export function TokenCandleChart({ candles, interval, mark, volumeUnit }: TokenCandleChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let disposed = false;
    let handle: ChartHandle | null = null;

    void mountChart(el, setHover).then(created => {
      if (disposed) {
        created.remove();
        return;
      }
      handle = created;
      handleRef.current = created;
      setReady(true);
    });

    return () => {
      disposed = true;
      handle?.remove();
      handleRef.current = null;
      setReady(false);
    };
  }, []);

  // Data follows the candles; the visible range is only refit when the interval changes.
  const lastInterval = useRef<string | null>(null);
  useEffect(() => {
    const handle = handleRef.current;
    if (!ready || !handle) return;
    handle.setData(candles);
    if (lastInterval.current !== interval) {
      lastInterval.current = interval;
      handle.fit(VISIBLE_CANDLES);
    }
  }, [ready, candles, interval]);

  const up = hover ? hover.close >= hover.open : true;

  return (
    <>
      <div ref={wrapRef} className="cc-tvchart" role="img" aria-label={`${interval} candles`} data-testid="token-candle-chart" />
      {hover && candles.length > 0 && (
        <div className="cc-ohlc cc-data" data-testid="chart-ohlc">
          o {mark}
          {subZero(hover.open)} · h {mark}
          {subZero(hover.high)} · l {mark}
          {subZero(hover.low)} · c{' '}
          <span className={up ? 'cc-up' : 'cc-dn'}>
            {mark}
            {subZero(hover.close)}
          </span>{' '}
          ·{' '}
          {hover.gap ? (
            <span className="cc-mute">no trades · held at the last close</span>
          ) : (
            <>
              vol {compact(hover.volume)}
              {volumeUnit ? ` ${volumeUnit}` : ''} · {hover.trades} trade{hover.trades === 1 ? '' : 's'}
            </>
          )}
        </div>
      )}
    </>
  );
}
