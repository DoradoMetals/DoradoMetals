import { nonIndexablePaths } from '@/shared/types/routes'
import type { MetadataRoute } from 'next'

// NO SITEMAP ANY MORE (the frontend nuke, ruling 99). `app/sitemap.ts` listed
// the public marketing and catalogue routes and every one of them is deleted;
// a sitemap of one URL is worse than none, because a `sitemap:` line pointing
// at a 404 is a crawl error rather than an omission. What is left to say is
// the negative: allow `/`, and keep the whole auth surface out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: nonIndexablePaths(),
      },
    ],
  }
}
