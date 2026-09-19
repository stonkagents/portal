import type { MetadataRoute } from 'next';
import { config } from '@/config';

export const dynamic = 'force-static';

const PUBLIC_PATHS = ['/', '/tokens/', '/gallery/', '/community/', '/terms/', '/privacy/', '/contact/'];

/** Public pages only; built from the brand domain so every environment names itself. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${config.brand.domain}`;
  return PUBLIC_PATHS.map((path) => ({ url: `${base}${path}` }));
}
