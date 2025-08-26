import { nonIndexablePaths } from '@/types/routes'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_FRONTEND_URL

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: nonIndexablePaths(),
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
