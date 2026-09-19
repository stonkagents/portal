/**
 * Purpose: The public origin the pre-launch page names itself by (metadata, JSON-LD,
 *          sitemap, share text). NEXT_PUBLIC_SITE_URL per deployment; the default is
 *          the primary domain, stonkagents.com.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stonkagents.com').trim().replace(/\/+$/, '');
