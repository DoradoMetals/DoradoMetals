import { nonIndexablePaths } from '@/shared/types/routes'
import type { MetadataRoute } from 'next'

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
