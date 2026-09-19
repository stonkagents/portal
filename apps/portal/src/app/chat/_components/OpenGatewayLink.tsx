'use client';

import { Icon } from '@/components/ui';
import { useGatewayLink } from '@/lib/api/hooks/use-gateway-link';
import { commandToolsPending, useCommandTools, type CommandToolsPending } from '@/lib/api/hooks/use-command-tools';
import { shortError } from '@/components/layout/CommandToolsChip';
import { useTranslation } from '@/providers/I18nProvider';

/** Why the link is disabled while the command tools job is not done. Exported for tests. */
export function gatewayBlockedTitle(state: CommandToolsPending, t: (key: string) => string, error: string | null = null): string {
  return state === 'running'
    ? `${t('commandTools.pending')} The link opens once they are ready.`
    : `${t('commandTools.failed')}: ${shortError(error)}. Retry it from the Command tools notice.`;
}

/**
 * "Open OpenClaw": the gateway's own UI in a new tab, signed in through the
 * token in the link. Hidden until the agent reports a gateway (2.4.2+), and
 * disabled while the background command tools job (2.6.0+) is still running
 * or has failed, since there is no gateway to open yet. The title says why
 * (the chat page shows the full notice in place of the composer).
 */
export function OpenGatewayLink() {
  const { data } = useGatewayLink();
  const { data: tools } = useCommandTools();
  const { t } = useTranslation();
  if (!data) return null;
  const blocked = commandToolsPending(tools, data.running);
  if (blocked) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex cursor-not-allowed items-center gap-1 text-xs text-text-tertiary"
        title={gatewayBlockedTitle(blocked, t, tools?.error ?? null)}
        data-testid="ac-open-gateway"
        data-running="false"
        data-blocked={blocked}
      >
        <Icon name="link" size="sm" />
        Open OpenClaw
      </span>
    );
  }
  return (
    <a
      href={data.dashboardUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent-green hover:underline"
      title={
        data.running
          ? 'Open the OpenClaw gateway in a new tab'
          : 'The OpenClaw gateway is not answering yet; it opens once it is running'
      }
      data-testid="ac-open-gateway"
      data-running={data.running ? 'true' : 'false'}
    >
      <Icon name="link" size="sm" />
      Open OpenClaw
    </a>
  );
}
