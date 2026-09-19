import type { MetadataRoute } from 'next';
import { config } from '@/config';

export const dynamic = 'force-static';

/** Crawler rules; the sitemap URL follows the configured brand domain. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/settings/', '/profile/'] },
    sitemap: `https://${config.brand.domain}/sitemap.xml`,
  };
}
