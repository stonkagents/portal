/**
 * Token detail: 404 when the mint is not on the tracker or is not a valid address.
 */

import Link from 'next/link';
import { Container, Icon } from '@/components/ui';

export default function TokenDetailNotFound() {
  return (
    <Container>
      <div className="py-12 text-center" data-testid="token-detail-not-found">
        <p className="mb-4 text-text-secondary">Agent not found.</p>
        <Link href="/tokens" className="inline-flex items-center gap-2 text-accent-green hover:underline">
          <Icon name="chevron-left" size="sm" /> Back to Agents
        </Link>
      </div>
    </Container>
  );
}
