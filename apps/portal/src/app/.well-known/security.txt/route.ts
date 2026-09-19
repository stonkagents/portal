import { config } from '@/config';

export const dynamic = 'force-static';

/** RFC 9116 security contact, generated from the brand domain at build time. */
export function GET(): Response {
  const base = `https://${config.brand.domain}`;
  const body = [
    `# Security contact for ${config.brand.domain}, the official ${config.brand.name} domain (RFC 9116).`,
    `Contact: ${base}/contact`,
    'Expires: 2027-09-16T00:00:00.000Z',
    'Preferred-Languages: en',
    `Canonical: ${base}/.well-known/security.txt`,
    `Policy: ${base}/privacy`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
