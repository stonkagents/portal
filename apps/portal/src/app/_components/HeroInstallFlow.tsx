/**
 * Purpose: Run your Agent — the one install flow, in its three-step frame:
 *
 *   Install      Locked until the wallet has launched a token (Step 1): a
 *                placeholder line and no link of any kind. Unlocked, on
 *                Windows: the manifest-backed installer and the real detection
 *                stepper (DaemonProvider's install watch). Every other platform:
 *                one honest "coming soon" with a copy-link-to-desktop action.
 *   Permissions  The agent's setup checks (GET /api/v1/setup/status), one row
 *                per concern with a Grant/Fix that POSTs and re-polls. "Launch
 *                your agent" is enabled once nothing fixable is left; a check
 *                the agent retries on its own (P2P, tracker registration) or
 *                one it could not finish in time is named in a note with a
 *                Recheck, never a wall with nothing to press.
 *   Live         The real peer id from health, the token binding while the
 *                claim is in flight, and one action: Browse Knowledge.
 *
 * Pre-endpoint behaviour: the setup surface does not exist on the daemon yet.
 * A 404 shows "Your agent needs an update to finish setup." and does not
 * block Live, because a healthy daemon is a running agent (see use-daemon-setup).
 */
// LOC-EXEMPT: install state machine UI with stepper, permissions rows, timeout and live states
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/ui';
import { ClawMascot } from '@/components/brand/ClawMascot';
import { GatedDownloadLink } from '@/components/features/install/GatedDownloadLink';
import { LocalAccessNotice } from '@/components/features/install/LocalAccessNotice';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { useTranslation } from '@/providers/I18nProvider';
import { agentAddress } from '@/lib/agent-address';
import { truncateAgentId } from '@/lib/utils/format';
import { useInterest } from '@/components/features/interest';
import type { DaemonSetup } from '@/components/features/onboarding/use-daemon-setup';
import { allChecksOk, checkTimedOut, pendingChecksNote } from '@/lib/api/daemon-setup';
import { INSTALLER_LOCKED_MESSAGE, type ManifestState } from '@/lib/installer/use-installer-downloads';
import type { LaunchClaimStatus } from '@/lib/api/hooks/use-launch-claim';
import {
  rowFix,
  rowStatus,
  SETUP_ROWS,
  SETUP_STATUS_LINE_IDS,
  type SetupCheckId,
  type SetupRow,
  type SetupStatus,
} from '@/lib/api/daemon-setup';
import type { HomePageState, InstallStep } from './useHomePage';

type AgentStage = 'install' | 'permissions' | 'live';

export type HeroInstallFlowProps = Pick<
  HomePageState,
  | 'installStep'
  | 'installTimeout'
  | 'setInstallTimeout'
  | 'installStartRef'
  | 'installerUnlocked'
  | 'os'
  | 'downloadUrl'
  | 'downloads'
  | 'handleDownload'
> & {
  manifestState?: ManifestState;
  retryDownloads?: () => void;
  /** Where the flow is; derived from the daemon when the caller has no setup state (chat panel). */
  agentStage?: AgentStage;
  setup?: DaemonSetup;
  /** "Launch your agent": every check is ok, move on to Live. */
  confirmSetup?: () => void;
  claimStatus?: LaunchClaimStatus;
};

const STEPS: { id: AgentStage; label: string }[] = [
  { id: 'install', label: 'Install' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'live', label: 'Live' },
];

const PLATFORM_LABELS: Record<string, string> = {
  macos: 'macOS',
  ios: 'iPhone and iPad',
  android: 'Android',
  other: 'this platform',
};

const ROW_ICONS: Record<SetupRow['id'], IconName> = { network: 'globe', storage: 'folder', bandwidth: 'zap' };

const STATUS_LINE_LABELS: Record<SetupCheckId, string> = {
  service: 'Agent service',
  controller: 'Controller',
  autostart: 'Autostart',
  tracker: 'Tracker',
  firewall: 'Firewall',
  p2p: 'P2P',
  storage: 'Storage',
  bandwidth: 'Bandwidth',
  origin: 'Portal origin',
};

/**
 * The three prompts an unsigned installer meets on the way, named before the
 * click so none of them reads as "this is broken": the browser's download
 * warning, SmartScreen, and the firewall prompt on the agent's first start.
 */
export const WINDOWS_DOWNLOAD_NOTES =
  'The installer is not code-signed yet. If your browser says the download is uncommon, choose Keep. If Windows SmartScreen says the publisher is unknown, choose More info, then Run anyway. When Windows Firewall asks about the agent on first start, choose Allow.';

const CTA_CLASS =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-accent-green text-black rounded-lg border-none cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] transition-shadow min-h-[44px] no-underline';
const CTA_SECONDARY_CLASS =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-text-primary bg-transparent rounded-lg border border-border-default cursor-pointer hover:border-accent-green/50 transition-colors min-h-[44px] no-underline';
const CTA_DISABLED_CLASS =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-bg-tertiary text-text-tertiary rounded-lg border border-border-default cursor-not-allowed min-h-[44px]';

export function HeroInstallFlow(props: HeroInstallFlowProps) {
  const { connected, support } = useDaemon();
  const stage: AgentStage = props.agentStage ?? (connected ? 'live' : 'install');
  const setupSkipped = props.setup?.state === 'unsupported' || props.setup?.state === 'unreachable';

  return (
    <div id="onboard" data-testid="run-agent-flow" data-stage={stage}>
      <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-3">Run your Agent</h2>
      <p className="text-sm text-text-secondary mb-5 leading-loose">Three easy steps to put your agent on the P2P network.</p>

      <StepFrame stage={stage} skipped={setupSkipped ? 'permissions' : null} />

      {stage === 'install' && <InstallStep {...props} support={support} />}
      {stage === 'permissions' && props.setup && <PermissionsStep setup={props.setup} onConfirm={props.confirmSetup} />}
      {stage === 'live' && <LiveStep installStep={props.installStep} claimStatus={props.claimStatus} setup={props.setup} />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function StepFrame({ stage, skipped }: { stage: AgentStage; skipped: AgentStage | null }) {
  const current = STEPS.findIndex(s => s.id === stage);
  return (
    <ol className="flex items-center justify-center gap-3 mb-6 list-none m-0 p-0" data-testid="run-agent-steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.id}
            className="flex items-center gap-3"
            data-testid={`run-agent-step-${s.id}`}
            data-state={done ? 'done' : active ? 'current' : 'pending'}
          >
            {i > 0 && <span className={cn('w-8 h-0.5 rounded', done || active ? 'bg-accent-green' : 'bg-border-default')} />}
            <span className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2',
                  done && 'border-accent-green bg-accent-green text-black',
                  active && 'border-accent-green text-accent-green',
                  !done && !active && 'border-border-default text-text-tertiary',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={cn('text-[11px] uppercase tracking-wide', done || active ? 'text-accent-green' : 'text-text-tertiary')}>
                {s.label}
                {skipped === s.id && done ? ' (skipped)' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

type InstallStepProps = HeroInstallFlowProps & { support: ReturnType<typeof useDaemon>['support'] };

function InstallStep({
  installStep,
  installTimeout,
  setInstallTimeout,
  installStartRef,
  installerUnlocked,
  os,
  downloadUrl,
  downloads,
  handleDownload,
  manifestState,
  retryDownloads,
  support,
}: InstallStepProps) {
  const { platform } = useDaemon();
  const { t } = useTranslation();

  /* Step 1 first: no installer, no copy-link, on any platform. */
  if (!installerUnlocked) {
    return <InstallerLocked />;
  }

  if (support === 'unsupported') {
    return <ComingSoon platformLabel={PLATFORM_LABELS[platform] ?? PLATFORM_LABELS.other} windowsUrl={downloads.windows} />;
  }

  return (
    <>
      {/* Download CTA — Windows only; the manifest names the file, nothing is guessed. */}
      {/* The link sits behind the local access gate: the browser's local network prompt is answered before the download. */}
      {support === 'supported' && os === 'windows' && (
        <div className="mb-6">
          {downloadUrl ? (
            <>
              <GatedDownloadLink href={downloadUrl} onDownload={handleDownload} data-testid="download-installer" className={CTA_CLASS}>
                <Icon name="download" size="sm" />
                Download for Windows
              </GatedDownloadLink>
              <p className="text-[11px] text-text-tertiary leading-relaxed mt-2 mb-0" data-testid="download-windows-notes">
                {WINDOWS_DOWNLOAD_NOTES}
              </p>
            </>
          ) : manifestState === 'unavailable' ? (
            <button type="button" onClick={retryDownloads} data-testid="download-unavailable" className={CTA_SECONDARY_CLASS}>
              <Icon name="alert-triangle" size="sm" />
              Download unavailable, try again
            </button>
          ) : (
            <button type="button" disabled aria-disabled="true" data-testid="download-pending" className={CTA_DISABLED_CLASS}>
              <span className="w-2 h-2 bg-accent-green rounded-full animate-daemon-pulse" />
              Preparing your download…
            </button>
          )}
        </div>
      )}

      {/* Detection stepper — driven by DaemonProvider's install watch */}
      {installStep !== 'idle' && (
        <div className="flex flex-col gap-3 mb-6" data-testid="install-stepper">
          {(
            [
              { id: 'waiting' as InstallStep, label: 'Download and install StonkAgents…' },
              { id: 'detecting' as InstallStep, label: `Detecting your agent on ${agentAddress()}…` },
              { id: 'live' as InstallStep, label: 'Your Agent is LIVE!' },
            ] as const
          ).map(step => {
            const order: InstallStep[] = ['waiting', 'detecting', 'live'];
            const curIdx = order.indexOf(installStep);
            const stepIdx = order.indexOf(step.id);
            const isDone = stepIdx < curIdx;
            const isActive = step.id === installStep;
            const isPending = stepIdx > curIdx;
            return (
              <div key={step.id} className={cn('flex items-center gap-3 py-2 transition-opacity', isPending && 'opacity-40')}>
                <span
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 transition-colors',
                    isDone && 'border-accent-green bg-accent-green text-black',
                    isActive && 'border-accent-green text-accent-green',
                    isPending && 'border-text-tertiary text-text-tertiary',
                  )}
                >
                  {isDone ? '✓' : isActive ? <span className="w-2 h-2 bg-accent-green rounded-full animate-daemon-pulse" /> : '•'}
                </span>
                <span className={cn('text-sm', isActive ? 'text-text-primary font-semibold' : 'text-text-secondary')}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeout: the permission banner first, since a blocked permission is the usual reason nothing was detected */}
      {installTimeout && (installStep === 'waiting' || installStep === 'detecting') && (
        <LocalAccessNotice priority={1} className="mb-4" />
      )}
      {installTimeout && (installStep === 'waiting' || installStep === 'detecting') && (
        <div
          className="flex items-start gap-3 p-3 mb-4 rounded-md bg-accent-yellow/8 border border-accent-yellow/20"
          data-testid="install-timeout"
        >
          <Icon name="alert-triangle" size="sm" className="text-accent-yellow shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="text-accent-yellow font-semibold">Agent not detected.</span> Make sure the installer finished and your
            agent is running on <code className="text-text-primary">{agentAddress()}</code>. Open StonkAgents from the Start Menu if it
            has not started on its own. {t('agent.localNetworkHint')}
            <button
              data-testid="install-retry"
              onClick={() => {
                installStartRef.current = Date.now();
                setInstallTimeout(false);
              }}
              className="ml-2 text-accent-green font-semibold bg-transparent border-none cursor-pointer hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The honest Step 2 preview before Step 1: what is coming, and nothing to download yet. */
function InstallerLocked() {
  return (
    <div
      className="flex items-start gap-3 p-3 mb-2 rounded-md bg-bg-tertiary border border-border-default"
      data-testid="installer-locked"
    >
      <Icon name="lock" size="sm" className="text-text-tertiary shrink-0 mt-0.5" />
      <p className="m-0 text-sm text-text-primary leading-relaxed">{INSTALLER_LOCKED_MESSAGE}</p>
    </div>
  );
}

/** Every platform without an installer: one honest state, and a link to carry to a desktop. */
function ComingSoon({ platformLabel, windowsUrl }: { platformLabel: string; windowsUrl?: string }) {
  const { addToast } = useToast();
  const { open: openInterest } = useInterest();

  const copy = async () => {
    const link = windowsUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
    try {
      await navigator.clipboard.writeText(link);
      addToast({
        title: 'Link copied',
        description: 'Open it on a Windows machine to run your agent.',
        variant: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast({ title: 'Could not copy the link', variant: 'error', autoDismiss: true });
    }
  };

  return (
    <div className="mb-2" data-testid="install-coming-soon">
      <div className="flex items-start gap-3 p-3 mb-4 rounded-md bg-bg-tertiary border border-border-default">
        <Icon name="clock" size="sm" className="text-text-tertiary shrink-0 mt-0.5" />
        <div className="text-sm text-text-secondary leading-relaxed">
          <span className="text-text-primary font-semibold">Coming soon for {platformLabel} and as a Cloud Agent.</span> Your agent
          runs on Windows today. Open this page on a Windows machine to install it; it binds to your token automatically.
        </div>
      </div>
      <button type="button" onClick={copy} data-testid="copy-desktop-link" className={CTA_CLASS}>
        <Icon name="copy" size="sm" />
        Copy link for your desktop
      </button>
      <button
        type="button"
        onClick={() => openInterest()}
        data-testid="coming-soon-feedback"
        className="mt-3 w-full text-center text-xs text-text-tertiary bg-transparent border-none cursor-pointer hover:text-accent-green"
      >
        Tell us what you wanted
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function PermissionsStep({ setup, onConfirm }: { setup: DaemonSetup; onConfirm?: () => void }) {
  const { state, status, fixing, fixError, fixNote, applyFix, refresh } = setup;

  if (state === 'checking' || !status) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-text-secondary" role="status" data-testid="permissions-checking">
        <span className="w-2 h-2 rounded-full bg-accent-green animate-daemon-pulse shrink-0" />
        Checking your agent&rsquo;s setup&hellip;
      </div>
    );
  }

  const ready = state === 'ready';
  /* Not ok, but nothing to grant: the agent is still connecting, or a check ran out of time. */
  const settling = allChecksOk(status) ? null : pendingChecksNote(status);

  return (
    <div data-testid="permissions-step">
      <div className="flex items-start gap-3 p-3 mb-4 bg-accent-green/6 border border-accent-green/20 rounded-lg text-xs">
        <Icon name="lock" size="sm" className="text-accent-green shrink-0 mt-0.5" />
        <span className="text-text-secondary">
          <strong className="text-text-primary">Your machine, your rules.</strong> Your agent runs locally. Nothing leaves your machine
          unless you share it.
        </span>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        {SETUP_ROWS.map(row => (
          <PermissionRow key={row.id} row={row} status={status} fixing={fixing} onFix={applyFix} />
        ))}
      </div>

      <StatusLine status={status} />

      {fixError && (
        <p className="text-xs text-accent-red mt-2 mb-0" role="alert" data-testid="permissions-fix-error">
          {fixError}
        </p>
      )}
      {fixNote && (
        <p className="text-xs text-accent-yellow mt-2 mb-0" role="status" data-testid="permissions-fix-note">
          {fixNote}
        </p>
      )}
      {settling && (
        <p className="text-xs text-accent-yellow mt-2 mb-0" role="status" data-testid="permissions-settling">
          {settling}{' '}
          <button
            type="button"
            onClick={() => void refresh()}
            data-testid="permissions-recheck"
            className="text-accent-green font-semibold bg-transparent border-none cursor-pointer hover:underline p-0"
          >
            Recheck
          </button>
        </p>
      )}

      <button
        type="button"
        disabled={!ready}
        onClick={onConfirm}
        data-testid="permissions-launch"
        className={cn('mt-4', ready ? CTA_CLASS : CTA_DISABLED_CLASS)}
      >
        <Icon name="rocket" size="sm" />
        Launch your agent
      </button>
      {!ready && <p className="text-xs text-text-tertiary text-center mt-2 mb-0">Grant every red row to continue</p>}
    </div>
  );
}

function PermissionRow({
  row,
  status,
  fixing,
  onFix,
}: {
  row: SetupRow;
  status: SetupStatus;
  fixing: SetupCheckId | null;
  onFix: (id: SetupCheckId) => Promise<void>;
}) {
  const rs = rowStatus(status, row);
  const ok = rs === 'ok';
  const fix = rowFix(status, row);
  const failing = status.checks.filter(c => row.checks.includes(c.id) && c.status !== 'ok');
  // A check the agent could not finish in its 8s budget is slow, not broken: say so
  // instead of showing the raw timeout text as if the permission were denied.
  const timedOut = failing.some(checkTimedOut);
  const message = timedOut
    ? 'Still checking. This can take a moment on first run; Recheck below asks again.'
    : failing.find(c => c.message)?.message;
  const busy = fix !== null && fixing === fix.id;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 bg-bg-secondary border rounded-lg',
        ok ? 'border-accent-green/30' : 'border-accent-red/30',
      )}
      data-testid={`perm-row-${row.id}`}
      data-status={rs}
    >
      <Icon name={ROW_ICONS[row.id]} size="sm" className={cn('shrink-0 mt-0.5', ok ? 'text-accent-green' : 'text-accent-red')} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{row.label}</div>
        <div className="text-xs text-text-secondary mt-0.5">{ok ? row.description : (message ?? row.description)}</div>
      </div>
      {ok ? (
        <span className="text-xs text-accent-green font-semibold shrink-0">{'✓'} Granted</span>
      ) : fix ? (
        <button
          type="button"
          disabled={fixing !== null}
          onClick={() => void onFix(fix.id)}
          data-testid={`perm-fix-${row.id}`}
          className="shrink-0 min-h-[36px] px-3 rounded-md border border-accent-green text-accent-green text-xs font-semibold bg-transparent cursor-pointer hover:bg-accent-green/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Applying…' : fix.status === 'failed' ? 'Fix' : 'Grant'}
        </button>
      ) : (
        <span className="text-xs text-accent-red font-semibold shrink-0">Needs attention</span>
      )}
    </div>
  );
}

function StatusLine({ status }: { status: SetupStatus }) {
  const items = SETUP_STATUS_LINE_IDS.map(id => status.checks.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary" data-testid="permissions-status-line">
      {items.map(c => (
        <span key={c.id} className="inline-flex items-center gap-1.5" data-testid={`perm-status-${c.id}`} data-status={c.status}>
          <span className={cn('w-1.5 h-1.5 rounded-full', c.status === 'ok' ? 'bg-accent-green' : 'bg-accent-red')} />
          {STATUS_LINE_LABELS[c.id]}
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function LiveStep({
  installStep,
  claimStatus,
  setup,
}: {
  installStep: InstallStep;
  claimStatus?: LaunchClaimStatus;
  setup?: DaemonSetup;
}) {
  const { health } = useDaemon();
  const peerId = health.peerId || null;

  return (
    <div className="text-center py-4" data-testid="live-step">
      <ClawMascot variant="online" animation={installStep === 'live' ? 'bounce' : 'none'} className="mx-auto mb-3 w-[80px] h-[80px]" />
      <h3 className="text-xl font-bold text-accent-green text-glow mb-1">Your Agent is LIVE!</h3>
      <p className="text-sm text-text-secondary mb-3">Connected to the Network</p>

      <div
        className="inline-flex flex-col items-start text-left gap-0.5 bg-bg-tertiary border border-border-default rounded-md px-3 py-2 mb-3 max-w-full"
        data-testid="live-peer-id"
      >
        <span className="text-[11px] text-text-secondary uppercase tracking-[0.08em]">Agent ID</span>
        <span className="text-sm font-mono text-text-primary truncate max-w-full">
          {truncateAgentId(peerId, 'Waiting for your agent’s id…')}
        </span>
      </div>

      {claimStatus === 'claiming' && (
        <p className="text-xs text-text-tertiary mb-3 flex items-center justify-center gap-2" role="status" data-testid="live-binding">
          <span className="w-2 h-2 rounded-full bg-accent-green animate-daemon-pulse shrink-0" />
          Binding it to your token now&hellip;
        </p>
      )}
      {claimStatus === 'claimed' && (
        <p className="text-xs text-accent-green mb-3" data-testid="live-bound">
          Bound to your token.
        </p>
      )}

      {setup?.state === 'unsupported' && (
        <p className="text-xs text-text-tertiary mb-3" data-testid="live-setup-update">
          Your agent needs an update to finish setup. The update banner at the top of the page offers it when one is ready.
        </p>
      )}
      {/* Live never waited on P2P or the tracker registration; say when they are still settling. */}
      {setup?.status && !allChecksOk(setup.status) && pendingChecksNote(setup.status) && (
        <p className="text-xs text-accent-yellow mb-3" role="status" data-testid="live-settling">
          {pendingChecksNote(setup.status)}
        </p>
      )}

      <Link href="/gallery" className={CTA_CLASS} data-testid="live-browse-knowledge">
        <Icon name="compass" size="sm" />
        Browse Knowledge
      </Link>
    </div>
  );
}
