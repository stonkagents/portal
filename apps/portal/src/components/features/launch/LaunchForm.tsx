'use client';

/**
 * The launch form.
 *
 * Three zones: the form on the left, the live summary on the right, and the
 * only button that matters inside the summary. Fill it in, sign once, and the
 * token is on a Raydium LaunchLab curve trading against $STONK.
 *
 * Every chain value comes from `GET /api/launch/config` for the $STONK quote:
 * the raise, the curve, the fee in lamports, the transfer tax. The form never
 * reads a launch parameter from the environment. $STONK is the only quote:
 * there is no picker, and a tracker that lists more than one is asked for the
 * $STONK entry.
 *
 * One agent per wallet. The tracker is asked for this wallet's launches right
 * before anything is paid for, and a 409 on the record afterwards is shown for
 * what it is rather than as a listing delay.
 *
 * The dev buy is paid in $STONK. On mainnet a wallet short of it is offered a
 * Jupiter swap SOL -> $STONK for the rest (`useStonkTopup`): the one button
 * runs the swap, waits for the balance, then launches. Two signatures, one
 * click. Devnet keeps the plain "lower it or top up" line.
 */

import { useHolderBalance } from '@/lib/api/hooks/use-holder-balance';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { config } from '@/config';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useWalletService } from '@/lib/wallet';
import { getPricesUsd } from '@/lib/api/price';
import { uploadMetadata } from '@/lib/api/launches';
import { completeLaunchSignatures, isMockLaunch, prepareLaunch, sendAndConfirm } from '@/lib/launchlab/build-launch';
import { classifyLaunchError, logErrorChain } from '@/lib/launchlab/errors';
import { normalizeCluster, useLaunchConfig, type LaunchConfig } from '@/lib/launchlab/launch-config';
import { computeLaunchSummary, curveShape } from '@/lib/launchlab/pricing';
import { stonkQuoteIn } from '@/lib/launchlab/quote-catalog';
import { solShortHint } from '@/lib/launchlab/constants';
import { useStonkTopup } from '@/lib/jupiter/use-stonk-topup';
import { StonkTopupNotice, topupBlocked, topupCtaLabel } from '@/components/features/topup/StonkTopupNotice';
import {
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_STUDIO_SETTINGS,
  defaultSymbolText,
  renderArtworkSet,
  type ArtworkSet,
  type StudioSettings,
} from '@/lib/launchlab/artwork';
import { ArtworkStudio } from './ArtworkStudio';
import { ConfirmingState } from './ConfirmingState';
import { DevBuySlider } from './DevBuySlider';
import { ImageDropZone } from './ImageDropZone';
import { LaunchpadLoading, LaunchpadOffline } from './LaunchFormStates';
import { Counter, Field, FieldNote, SectionLabel, controlClass, mono } from './FieldChrome';
import { LaunchSuccess } from './LaunchSuccess';
import { LaunchSummary } from './LaunchSummary';
import { ProjectLinkField } from './ProjectLinkField';
import { TokenPreviewCard } from './TokenPreviewCard';
import { findExistingLaunch, type ExistingLaunch } from './record-failure';
import { useLaunchRecord, type RecordOutcome } from './use-launch-record';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SYMBOL_LENGTH,
  symbolCollision,
  validateImageFile,
  validateLaunchForm,
  type FieldErrors,
} from './form-schema';
import type { LaunchFormValues, LaunchPhase, LaunchResult } from './types';

export interface LaunchFormProps {
  /** Fires once, when the creator moves on from the success screen. */
  onLaunched: (result: LaunchResult) => void;
  /** Fires the moment the launch is live, before the creator moves on. */
  onConfirmed?: (result: LaunchResult) => void;
  /** Symbols already on the Network, for the collision warning. */
  existingSymbols?: string[];
}

const initialValues = (): LaunchFormValues => ({
  name: '',
  symbol: '',
  description: '',
  imageDataUrl: null,
  thumbnailDataUrl: null,
  website: '',
  twitter: '',
  telegram: '',
  devBuyMode: 'percent',
  devBuyPercent: 0,
  devBuyQuoteAmount: 0,
});

const MOCK_IMAGE_PLACEHOLDER = '';

/** True for a WebP whose VP8X header carries the animation flag. Any read failure is "not animated". */
async function isAnimatedWebP(file: File): Promise<boolean> {
  if (file.type !== 'image/webp' || typeof file.slice !== 'function') return false;
  try {
    const head = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    const tag = (at: number, text: string) => Array.from(text).every((ch, i) => head[at + i] === ch.charCodeAt(0));
    return head.length >= 21 && tag(0, 'RIFF') && tag(8, 'WEBPVP8X') && (head[20] & 0x02) !== 0;
  } catch {
    return false;
  }
}

const PHANTOM_URL = 'https://phantom.app';

/** The wallet layer's error, with the install link clickable. */
function walletErrorNode(message: string): React.ReactNode {
  const index = message.indexOf(PHANTOM_URL);
  if (index === -1) return message;
  return (
    <>
      {message.slice(0, index)}
      <a href={PHANTOM_URL} target="_blank" rel="noopener noreferrer" className="underline">
        {PHANTOM_URL}
      </a>
      {message.slice(index + PHANTOM_URL.length)}
    </>
  );
}

/** Quote amounts in prose: two decimals at most, thousands separated. */
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Bring a part of the form that just appeared or was asked for into view and
 * put focus there, so nothing important sits below the fold unnoticed.
 */
function reveal(el: HTMLElement | null, focus?: HTMLElement | null) {
  if (!el) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  (focus ?? el).focus?.({ preventScroll: true });
}

export function LaunchForm({ onLaunched, onConfirmed, existingSymbols = [] }: LaunchFormProps) {
  const wallet = useWalletService();
  const [values, setValues] = useState<LaunchFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);
  // The picked image stays around so the crop can be reopened and redone.
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [studioSettings, setStudioSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [studioOpen, setStudioOpen] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!studioOpen) return;
    const root = studioRef.current;
    reveal(root, root?.querySelector<HTMLElement>('#artwork-symbol-input') ?? root);
  }, [studioOpen]);
  const [phase, setPhaseState] = useState<LaunchPhase>('form');
  // The catch block needs to know which step failed; state is stale inside it.
  const phaseRef = useRef<LaunchPhase>('form');
  const setPhase = useCallback((next: LaunchPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceByMint, setPriceByMint] = useState<Record<string, number>>({});
  // The wallet check and re-pricing that run before anything is paid for.
  const [preflight, setPreflight] = useState(false);
  // The agent the tracker already holds for this wallet: no second launch.
  const [blockedBy, setBlockedBy] = useState<ExistingLaunch | null>(null);
  const tracker = useLaunchRecord();

  // Every launch pairs with $STONK: the tracker's default config is priced for
  // it (#19 backend). Should a tracker default to another quote, the config is
  // re-read for the $STONK entry in its catalog. There is no picker.
  const [quoteMintParam, setQuoteMintParam] = useState<string | undefined>(undefined);
  const configQuery = useLaunchConfig(quoteMintParam, { live: true });
  const launchConfig = configQuery.data;
  const quote = launchConfig?.quote;
  const configSettled = Boolean(launchConfig) && !configQuery.isPlaceholderData;
  const stonkQuote = launchConfig ? stonkQuoteIn(launchConfig) : null;
  useEffect(() => {
    if (!launchConfig || configQuery.isPlaceholderData || !stonkQuote) return;
    if (stonkQuote.quoteMint !== launchConfig.quote.quoteMint) setQuoteMintParam(stonkQuote.quoteMint);
  }, [launchConfig, configQuery.isPlaceholderData, stonkQuote]);
  const noStonkQuote = configSettled && !stonkQuote;

  // A wallet switch is a different creator: the block belongs to the old one.
  useEffect(() => {
    setBlockedBy(null);
  }, [wallet.publicKey]);

  // The tracker's program ids live on one cluster; the wallet signs for another
  // only if the two agree. Unknown on either side is not a mismatch.
  const trackerCluster = normalizeCluster(launchConfig?.cluster);
  const walletCluster = normalizeCluster(wallet.network);
  const clusterMismatch =
    wallet.connected && trackerCluster && walletCluster && trackerCluster !== walletCluster
      ? `This build talks to a ${trackerCluster} launchpad but the wallet is connected to ${walletCluster}.`
      : null;

  useEffect(() => {
    if (!launchConfig) return;
    let live = true;
    getPricesUsd([launchConfig.quote.quoteMint])
      .then(prices => {
        if (live) setPriceByMint(prev => ({ ...prev, ...prices }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [launchConfig]);

  /** The summary for one config: the memoised one below, and a fresh one at launch time. */
  const summaryFor = useCallback(
    (cfg: LaunchConfig) =>
      computeLaunchSummary({
        quote: cfg.quote,
        curve: curveShape(cfg.curve),
        raise: cfg.raise,
        quotePriceUsd: priceByMint[cfg.quote.quoteMint] ?? 0,
        solUsd: cfg.fee.solUsd || config.fees.fallbackSolUsd,
        launchFeeLamports: cfg.fee.lamports,
        devBuyPercent: values.devBuyMode === 'percent' ? values.devBuyPercent : undefined,
        devBuyQuoteAmount: values.devBuyMode === 'amount' ? values.devBuyQuoteAmount : undefined,
        fees: {
          protocolBps: config.fees.protocolBps,
          platformBps: config.fees.platformBps,
          holderTaxBps: cfg.transferFeeBps,
          creatorBps: config.fees.creatorBps,
          launchFeeUsd: cfg.fee.usd,
        },
      }),
    [priceByMint, values.devBuyMode, values.devBuyPercent, values.devBuyQuoteAmount],
  );
  const summary = useMemo(() => (launchConfig && quote ? summaryFor(launchConfig) : null), [launchConfig, quote, summaryFor]);

  // The raise follows the market while the form is open; say so when it moves.
  const [raiseNote, setRaiseNote] = useState<string | null>(null);
  const previousRaise = useRef<string | null>(null);
  useEffect(() => {
    const raw = launchConfig?.raise.raw ?? null;
    if (raw == null) return;
    const before = previousRaise.current;
    previousRaise.current = raw;
    if (before == null || before === raw || !summary || !quote) return;
    setRaiseNote(`Prices moved: the raise is now ${fmt(summary.graduationQuote)} $${quote.symbol}.`);
    const timer = setTimeout(() => setRaiseNote(null), 8_000);
    return () => clearTimeout(timer);
  }, [launchConfig?.raise.raw, summary, quote]);

  // The dev buy is paid from the wallet's $STONK; say when it does not cover it.
  const { balance: rawQuoteBalance, loading: quoteBalanceLoading } = useHolderBalance(quote?.quoteMint ?? null, wallet.publicKey ?? null);
  const quoteBalance = quote ? rawQuoteBalance / 10 ** quote.decimals : 0;
  const devBuyNeeded = summary?.devBuy.quoteAmount ?? 0;
  // Rent, the launch fee and gas come out of the wallet's SOL; the dev buy never does.
  const solNeeded = summary ? summary.launchCost.totalSol + 0.002 : 0;
  const solShort =
    wallet.connected && summary && wallet.balance != null && wallet.balance < solNeeded
      ? `This wallet holds ${fmt(wallet.balance)} SOL; the launch needs about ${solNeeded.toFixed(3)} SOL for rent, the fee and gas. ${solShortHint(config.cluster)}`
      : null;
  // On mainnet a short dev buy is topped up from SOL through Jupiter, then the launch goes on by itself.
  const topup = useStonkTopup({
    quoteMint: quote?.quoteMint ?? null,
    quoteSymbol: quote?.symbol ?? 'STONK',
    quoteDecimals: quote?.decimals ?? 9,
    needed: devBuyNeeded,
    balance: quoteBalance,
    reserve: { sol: solNeeded, label: 'the launch' },
    enabled: wallet.connected && Boolean(quote) && !quoteBalanceLoading && !solShort,
  });
  const devBuyShort =
    wallet.connected && quote && summary && !quoteBalanceLoading && devBuyNeeded > quoteBalance
      ? `Your dev buy needs ${fmt(devBuyNeeded)} $${quote.symbol}; this wallet holds ${fmt(quoteBalance)}. ` +
        (topup.canTopUp ? 'Lower it, or swap SOL for the rest.' : 'Lower it or top up.')
      : null;

  const update = useCallback(
    (patch: Partial<LaunchFormValues>) => {
      setValues(prev => {
        const next = { ...prev, ...patch };
        if (touched) {
          const check = validateLaunchForm(next);
          setErrors(check.success ? {} : check.fieldErrors);
        }
        return next;
      });
    },
    [touched],
  );

  const onPickImage = useCallback((file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setImageNote(problem);
      return;
    }
    setImageNote(null);
    // An animated WebP passes the type check; only its first frame survives the painter.
    void isAnimatedWebP(file).then(animated => {
      if (animated) setImageNote('Animated WebP: only the first frame is used.');
    });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      // Show the pick straight away; the painted master replaces it as soon as the image has decoded.
      setValues(prev => ({ ...prev, imageDataUrl: dataUrl, thumbnailDataUrl: null }));
      const image = new Image();
      image.onload = () => {
        setSource(image);
        setStudioSettings(prev => ({ ...prev, mode: 'image', image: DEFAULT_IMAGE_SETTINGS }));
        // Square or not, every pick goes through the same painter: a 512 px master
        // and a 128 px thumb, centred on the image. A browser that cannot draw keeps the raw file.
        const painted = renderArtworkSet(image, DEFAULT_IMAGE_SETTINGS);
        if (painted) setValues(prev => ({ ...prev, imageDataUrl: painted.master, thumbnailDataUrl: painted.thumb }));
        // Not square: open the studio so the creator can move the focus.
        if (image.width !== image.height) setStudioOpen(true);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const openStudio = useCallback((mode?: StudioSettings['mode']) => {
    if (mode) setStudioSettings(prev => ({ ...prev, mode }));
    setStudioOpen(true);
  }, []);
  const applyArtwork = useCallback((artwork: ArtworkSet, settings: StudioSettings) => {
    setStudioSettings(settings);
    setValues(prev => ({ ...prev, imageDataUrl: artwork.master, thumbnailDataUrl: artwork.thumb }));
    setStudioOpen(false);
  }, []);
  const closeStudio = useCallback(() => setStudioOpen(false), []);

  const launch = useCallback(async () => {
    if (!launchConfig || !quote || !summary) return;
    setError(null);
    const name = values.name.trim();
    const symbol = values.symbol.trim().toUpperCase();
    const creatorWallet = wallet.publicKey ?? '';
    const description = values.description.trim() || `${name} on ${config.brand.name}. ${config.brand.slogan}`;
    const mock = isMockLaunch();

    // Two things to know before anything is paid for. One agent per wallet:
    // this browser cannot know about a launch claimed on another machine, and
    // the tracker would refuse the record only after the token is on chain. And
    // the price: the raise is sized to the market, so the launch is built from
    // the freshest config and the summary says if it moved.
    setPreflight(true);
    let latest = launchConfig;
    try {
      if (!mock) {
        const existing = await findExistingLaunch(creatorWallet);
        if (existing) {
          setBlockedBy(existing);
          return;
        }
        latest = (await configQuery.refetch()).data ?? launchConfig;
      }
    } finally {
      setPreflight(false);
    }
    const liveSummary = latest === launchConfig ? summary : summaryFor(latest);

    try {
      setPhase('uploading');
      let imageUrl = mock ? (values.imageDataUrl ?? MOCK_IMAGE_PLACEHOLDER) : '';
      let imageThumbUrl: string | null = mock ? values.thumbnailDataUrl : null;
      let metadataUri = `stonkagents:pending/${symbol}`;

      if (!mock) {
        const uploaded = await uploadMetadata({
          name,
          symbol,
          description,
          website: values.website.trim(),
          twitter: values.twitter.trim(),
          telegram: values.telegram.trim(),
          creatorWallet,
          imageDataUrl: values.imageDataUrl ?? '',
          ...(values.thumbnailDataUrl ? { thumbnailDataUrl: values.thumbnailDataUrl } : {}),
        });
        imageUrl = uploaded.imageUri;
        imageThumbUrl = uploaded.thumbnailUri || null;
        ({ metadataUri } = uploaded);
      }

      const devBuy = liveSummary.devBuy.quoteAmount;
      const prepared = await prepareLaunch({
        launchConfig: latest,
        quote,
        name,
        symbol,
        uri: metadataUri,
        creatorWallet,
        devBuyQuoteAmount: devBuy,
      });

      let signature: string;
      if (prepared.transaction) {
        setPhase('signing');
        // The wallet signs first, on an unsigned transaction; the mint and the
        // SDK's signers are added to what it returns. Its message is not touched.
        const signed = completeLaunchSignatures(await wallet.sign(prepared.transaction), prepared.signers);
        setPhase('confirming');
        signature = await sendAndConfirm(signed, {
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        });
      } else {
        setPhase('confirming');
        signature = `mock${prepared.mint.slice(0, 20)}`;
      }
      setTxSignature(signature);

      // The chain is the record. A failed write-back must not undo a live token;
      // the hook classifies it and keeps the body for a retry.
      let outcome: RecordOutcome = { recorded: false, recordError: null };
      tracker.reset();
      if (!prepared.summary.mock) {
        setPhase('recording');
        outcome = await tracker.record({
          mint: prepared.mint,
          poolId: prepared.poolId,
          creatorWallet,
          // The tracker names the quote every launch raises in; the built transaction used the same one.
          quoteMint: latest.defaultQuoteMint ?? quote.quoteMint,
          name,
          symbol,
          imageUrl,
          ...(imageThumbUrl ? { imageThumbUrl } : {}),
          metadataUri,
          launchSignature: signature,
          feeLamports: latest.fee.lamports,
          transferFeeBps: latest.transferFeeBps,
        });
      }

      const launched: LaunchResult = {
        mint: prepared.mint,
        poolId: prepared.poolId,
        txSignature: signature,
        name,
        symbol,
        imageUrl,
        imageThumbUrl,
        metadataUri,
        quote,
        quoteSymbol: quote.symbol,
        holderTaxBps: latest.transferFeeBps,
        devBuy,
        feeLamports: latest.fee.lamports,
        programId: latest.programId,
        ...outcome,
        mock: prepared.summary.mock,
      };

      setResult(launched);
      setPhase('success');
      // A token the tracker refused as a second launch is on chain but is not
      // this wallet's agent; the rest of the flow must not adopt it.
      if (outcome.recordError?.kind !== 'exists') onConfirmed?.(launched);
    } catch (err) {
      logErrorChain('launch', err);
      const failedAt = phaseRef.current;
      setError(classifyLaunchError(err, failedAt === 'form' || failedAt === 'success' ? undefined : failedAt));
      setPhase('form');
    }
  }, [launchConfig, configQuery, quote, summary, summaryFor, values, wallet, tracker, onConfirmed, setPhase]);

  /** Re-send the record of the live token, same body, and update the success screen. */
  const retryRecord = useCallback(async () => {
    if (!result) return;
    const next = await tracker.retry(result);
    if (!next) return;
    setResult(next);
    if (next.recorded) onConfirmed?.(next);
  }, [result, tracker, onConfirmed]);

  const onPrimary = useCallback(async () => {
    if (!wallet.connected) {
      // The wallet layer reports "not installed" through wallet.error; it is rendered under the CTA.
      void wallet.connect().catch(() => undefined);
      return;
    }
    setTouched(true);
    const check = validateLaunchForm(values);
    setErrors(check.success ? {} : check.fieldErrors);
    if (!check.success) {
      setError('Fix the highlighted fields and try again.');
      return;
    }
    if (!configSettled) {
      setError('Still pricing the launch. One moment.');
      return;
    }
    if (clusterMismatch) {
      setError(clusterMismatch);
      return;
    }
    if (blockedBy || preflight || topup.status.kind === 'pending') return;
    // A short dev buy is topped up first; the launch follows without another click.
    if (topup.canTopUp && (await topup.run()) !== 'done') return;
    void launch();
  }, [wallet, values, configSettled, clusterMismatch, blockedBy, preflight, topup, launch]);

  if (phase === 'success' && result) {
    return <LaunchSuccess result={result} onContinue={onLaunched} onRetryRecord={retryRecord} retrying={tracker.retrying} />;
  }

  if (phase !== 'form') {
    return <ConfirmingState phase={phase} txSignature={txSignature} name={values.name} symbol={values.symbol} />;
  }

  if ((configQuery.isError && !launchConfig) || noStonkQuote) {
    return <LaunchpadOffline noStonkQuote={noStonkQuote} error={configQuery.error} onRetry={() => void configQuery.refetch()} />;
  }

  if (!launchConfig || !quote || !summary) {
    return <LaunchpadLoading />;
  }

  const collision = symbolCollision(values.symbol, existingSymbols);
  const topping = devBuyShort != null && topup.canTopUp;
  const actionLabel = !wallet.connected ? 'Connect wallet' : topping ? topupCtaLabel(topup, quote.symbol) : 'Launch Agent';
  // The three fields the chain cannot do without gate the button; the rest are validated on submit.
  const check = validateLaunchForm(values);
  const coreErrors = check.success ? {} : check.fieldErrors;
  const coreInvalid = Boolean(coreErrors.name || coreErrors.symbol || coreErrors.imageDataUrl);
  const liveError = (field: 'name' | 'symbol' | 'imageDataUrl', typed: boolean) =>
    errors[field] ?? (typed ? coreErrors[field] : undefined);
  const walletNote = !wallet.connected && wallet.error ? walletErrorNode(wallet.error) : null;

  return (
    <div className="grid gap-8 pb-36 lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-10 lg:pb-0" data-testid="launch-form">
      <div className="flex flex-col gap-8">
        {/* 01 · Identity */}
        <section className="flex flex-col gap-4" aria-label="Identity">
          <SectionLabel index="01">Identity</SectionLabel>

          <Field label="Agent name" hint={<Counter value={values.name} max={MAX_NAME_LENGTH} />}>
            <Input
              value={values.name}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Signal Hound"
              aria-label="Agent name"
              error={liveError('name', values.name.length > 0)}
              onChange={e => update({ name: e.target.value })}
              className="hover:border-border-hover"
            />
          </Field>

          <Field label="Symbol" hint={<Counter value={values.symbol} max={MAX_SYMBOL_LENGTH} />}>
            <div className="relative">
              <span
                aria-hidden="true"
                className={cn(mono, 'pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-text-tertiary')}
              >
                $
              </span>
              <Input
                value={values.symbol}
                maxLength={MAX_SYMBOL_LENGTH}
                placeholder="HOUND"
                aria-label="Symbol"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                error={liveError('symbol', values.symbol.length > 0)}
                onChange={e => update({ symbol: e.target.value.replace(/\s+/g, '').toUpperCase() })}
                className={cn(mono, 'pl-7 uppercase tracking-wide hover:border-border-hover')}
              />
            </div>
            {collision && (
              <FieldNote tone="warn" data-testid="symbol-collision">
                ${values.symbol.toUpperCase()} is already on the Network. Yours will be hard to find.
              </FieldNote>
            )}
          </Field>

          <Field label="Description" hint={<Counter value={values.description} max={MAX_DESCRIPTION_LENGTH} />}>
            <textarea
              value={values.description}
              maxLength={MAX_DESCRIPTION_LENGTH + 20}
              rows={3}
              placeholder="What your agent does, in a sentence."
              aria-label="Description"
              aria-invalid={errors.description ? 'true' : undefined}
              onChange={e => update({ description: e.target.value })}
              className={cn(controlClass(Boolean(errors.description)), 'min-h-[88px] resize-none px-3 py-3 leading-5')}
            />
            {errors.description && <FieldNote tone="error">{errors.description}</FieldNote>}
          </Field>

          <Field
            label="Agent image"
            hint={<span className={cn(mono, 'text-[11px] text-text-tertiary')}>PNG · JPEG · WebP · ≤ 2 MB</span>}
          >
            <ImageDropZone
              imageDataUrl={values.imageDataUrl}
              invalid={Boolean(errors.imageDataUrl)}
              onPick={onPickImage}
              onMakeSymbol={() => openStudio('symbol')}
              onAdjust={() => openStudio()}
            />
            {studioOpen && (
              <div ref={studioRef} tabIndex={-1} className="outline-none" data-testid="artwork-studio-anchor">
                <ArtworkStudio
                  source={source}
                  initial={studioSettings}
                  symbolSeed={defaultSymbolText(values.symbol, values.name)}
                  onApply={applyArtwork}
                  onCancel={closeStudio}
                />
              </div>
            )}
            {errors.imageDataUrl && <FieldNote tone="error">{errors.imageDataUrl}</FieldNote>}
            {imageNote && <FieldNote tone="warn">{imageNote}</FieldNote>}
          </Field>

          <TokenPreviewCard name={values.name} symbol={values.symbol} imageDataUrl={values.imageDataUrl} quoteSymbol={quote.symbol} />
        </section>

        {/* 02 · Dev buy */}
        <DevBuySlider
          mode={values.devBuyMode}
          percent={values.devBuyPercent}
          quoteAmount={values.devBuyQuoteAmount}
          quoteSymbol={quote.symbol}
          estimate={summary.devBuy}
          onModeChange={mode => update({ devBuyMode: mode })}
          onPercentChange={percent => update({ devBuyPercent: percent })}
          onQuoteAmountChange={amount => update({ devBuyQuoteAmount: amount })}
        />
        {wallet.connected && quote && (
          <p
            className={cn(mono, 'text-[11px] leading-4', devBuyShort ? 'text-accent-red' : 'text-text-tertiary')}
            role={devBuyShort ? 'alert' : undefined}
            data-testid="dev-buy-balance"
          >
            {devBuyShort ??
              (quoteBalanceLoading ? `Reading your $${quote.symbol} balance…` : `You hold ${fmt(quoteBalance)} $${quote.symbol}.`)}
          </p>
        )}

        {/* 03 · Project links */}
        <section ref={linksRef} tabIndex={-1} className="flex flex-col gap-4 outline-none" aria-label="Project links">
          <SectionLabel
            index="03"
            trailing={
              <button
                type="button"
                onClick={() => reveal(linksRef.current, linksRef.current?.querySelector<HTMLElement>('input') ?? null)}
                title="Jump to the project links"
                data-testid="project-links-jump"
                className={cn(
                  mono,
                  'cursor-pointer border-none bg-transparent p-0 text-[11px] text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
                )}
              >
                optional ↓
              </button>
            }
          >
            Project links
          </SectionLabel>
          <div className="flex flex-col gap-3">
            <ProjectLinkField
              platform="website"
              value={values.website}
              error={errors.website}
              onChange={website => update({ website })}
            />
            <ProjectLinkField platform="x" value={values.twitter} error={errors.twitter} onChange={twitter => update({ twitter })} />
            <ProjectLinkField
              platform="telegram"
              value={values.telegram}
              error={errors.telegram}
              onChange={telegram => update({ telegram })}
            />
          </div>
        </section>
      </div>

      <LaunchSummary
        summary={summary}
        quote={quote}
        feeStale={launchConfig.fee.stale}
        pricing={!configSettled}
        actionLabel={actionLabel}
        onAction={() => void onPrimary()}
        disabled={
          wallet.connected &&
          (coreInvalid ||
            Boolean(clusterMismatch) ||
            (Boolean(devBuyShort) && !topping) ||
            (topping && topupBlocked(topup)) ||
            Boolean(solShort) ||
            Boolean(blockedBy))
        }
        busy={wallet.connecting || preflight || topup.status.kind === 'pending'}
        note={error ?? raiseNote}
        extra={
          walletNote ? (
            <span className="text-accent-red">{walletNote}</span>
          ) : topping && !blockedBy && !clusterMismatch ? (
            <StonkTopupNotice topup={topup} quoteSymbol={quote.symbol} action="the launch" className="text-left" />
          ) : blockedBy ? (
            <span className="text-accent-red" data-testid="launch-wallet-has-agent">
              This wallet already has an agent: {blockedBy.name ?? blockedBy.mint}
              {blockedBy.symbol ? ` ($${blockedBy.symbol.toUpperCase()})` : ''}.{' '}
              <Link href={`/tokens/${blockedBy.mint}/`} className="underline hover:text-text-primary">
                Open it
              </Link>
              , or connect another wallet to launch again.
            </span>
          ) : solShort ? (
            <span className="text-accent-red" data-testid="launch-sol-short">
              {solShort}
            </span>
          ) : clusterMismatch ? (
            <span className="text-accent-red" data-testid="launch-cluster-mismatch">
              {clusterMismatch}
            </span>
          ) : wallet.connected && coreInvalid ? (
            <span className="text-text-tertiary">Add a name, a symbol and an image to launch.</span>
          ) : null
        }
      />
    </div>
  );
}
