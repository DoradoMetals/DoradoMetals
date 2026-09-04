import type { MetadataRoute } from 'next'
import { protectedRoutes } from '@/features/routes/types'
import { fetchProducts } from '@dorado/client'
import type { BullionGroup } from '@dorado/contracts'

export const revalidate = 21600

type R = (typeof protectedRoutes)[keyof typeof protectedRoutes]
const isPublic = (r: R) => r.roles.length === 0 || r.roles.every((role) => !role?.trim?.())
const indexablePaths = () =>
  Object.values(protectedRoutes)
    .filter((r) => isPublic(r) && r.seoIndex)
    .map((r) => r.path)

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

  // Runs on the server at request time, outside react-query, so it calls the
  // client package's plain fetcher rather than a hook. GROUPS, not rows: one
  // slug per family is exactly one sitemap entry, which is what the dedupe
  // below used to do after the fact.
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
