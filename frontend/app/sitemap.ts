import type { MetadataRoute } from 'next'
import { indexablePaths } from '@/shared/types/routes'
import type { BullionGroup } from '@dorado/contracts'
import { fetchProducts } from '@dorado/client'

export const revalidate = 21600

function dedupe(arr: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const seen = new Set<string>()
  return arr.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_FRONTEND_URL!
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: new URL('/', base).toString(),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    } satisfies MetadataRoute.Sitemap[number],
    ...indexablePaths().map(
      (path) =>
        ({
          url: new URL(path, base).toString(),
          lastModified: now,
          changeFrequency: 'monthly',
          priority: path === '/buy' || path === '/sell' ? 0.8 : 0.5,
        } satisfies MetadataRoute.Sitemap[number])
    ),
  ]

  let groups: BullionGroup[] = []
  try {
    groups = await fetchProducts()
  } catch (e) {
    console.error('sitemap products fetch failed:', e)
  }

  const toAbs = (src?: string) =>
    src ? (src.startsWith('http') ? src : new URL(src, base).toString()) : undefined

  const productEntries: MetadataRoute.Sitemap = groups
    .map((g) => g.default)
    .filter((p) => p.slug)
    .map(
      (p) =>
        ({
          url: new URL(`/buy/${p.slug!}`, base).toString(),
          lastModified: new Date(now),
          changeFrequency: 'weekly',
          priority: 0.7,
          images: p.image_front ? [toAbs(p.image_front)!] : undefined,
        } satisfies MetadataRoute.Sitemap[number])
    )

  return dedupe([...staticEntries, ...productEntries])
}
