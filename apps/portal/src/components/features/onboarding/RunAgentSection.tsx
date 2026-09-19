/**
 * Purpose: Run your Agent as a page section (RUN-1). The same HeroInstallFlow
 *          the Step 2 hero renders, framed for the slot under the Launchpad,
 *          so the home page has exactly one install flow and no prototype.
 */
'use client';

import { Container } from '@/components/ui';
import { HeroInstallFlow, type HeroInstallFlowProps } from '@/app/_components/HeroInstallFlow';

export function RunAgentSection(props: HeroInstallFlowProps) {
  return (
    <section className="py-12 border-b border-border-default" data-testid="run-agent-section">
      <Container className="max-w-[640px] md:max-w-[640px]">
        <div className="bg-bg-void/90 border border-[rgba(30,37,48,0.6)] rounded-lg p-4 md:p-6">
          <HeroInstallFlow {...props} />
        </div>
      </Container>
    </section>
  );
}
