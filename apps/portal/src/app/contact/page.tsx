/**
 * Contact, v1. The configured mailbox, the public places the project lives,
 * and the one official domain. Also the target of /.well-known/security.txt.
 */
import type { Metadata } from 'next';
import { config } from '@/config';
import { TrustPage } from '@/components/features/trust/TrustPage';

export const metadata: Metadata = {
  title: `Contact | ${config.brand.name}`,
  description: `How to reach the ${config.brand.name} team, and where ${config.brand.domain} lives online.`,
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  const { name, domain } = config.brand;
  const { contactEmail, x, github } = config.links;
  return (
    <TrustPage title="Contact" subtitle={`Reach the ${name} team`} version="v1" date="16 September 2026" testId="contact-page">
      <h2>The official domain</h2>
      <p>
        <a href={`https://${domain}`} data-testid="contact-domain">
          {domain}
        </a>{' '}
        is the official {name} domain. Anything claiming to be {name} on another domain is not us.
      </p>
      <h2>Email</h2>
      {contactEmail ? (
        <p>
          <a href={`mailto:${contactEmail}`} data-testid="contact-email">
            {contactEmail}
          </a>{' '}
          for questions, takedown requests and security reports. A report about a vulnerability gets a reply first.
        </p>
      ) : (
        <p data-testid="contact-email-unset">The mailbox for this deployment is not configured yet.</p>
      )}
      {(github || x) && (
        <>
          <h2>Elsewhere</h2>
          <ul>
            {github && (
              <li>
                Source and issues:{' '}
                <a href={github} target="_blank" rel="noopener noreferrer" data-testid="contact-github">
                  {github}
                </a>
              </li>
            )}
            {x && (
              <li>
                X:{' '}
                <a href={x} target="_blank" rel="noopener noreferrer" data-testid="contact-x">
                  {x}
                </a>
              </li>
            )}
          </ul>
        </>
      )}
    </TrustPage>
  );
}
