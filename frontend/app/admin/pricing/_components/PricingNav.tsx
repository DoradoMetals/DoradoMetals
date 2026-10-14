'use client'

import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { Link as UILink } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

const SECTIONS = [
  { label: 'Spots', href: protectedRoutes.adminPricingSpots.path },
  { label: 'Rates', href: protectedRoutes.adminPricingRates.path },
]

export function PricingNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Pricing" className="flex items-center gap-md">
      {SECTIONS.map((section) => (
        <UILink key={section.href} asChild>
          <NextLink
            href={section.href}
            aria-current={pathname.startsWith(section.href) ? 'page' : undefined}
          >
            {section.label}
          </NextLink>
        </UILink>
      ))}
    </nav>
  )
}
