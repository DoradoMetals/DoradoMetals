'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminHeader, Breadcrumb, Chip } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

import { AdminTabs } from '../../_components'

type Section = 'spots' | 'rates'

const SECTIONS: { value: Section; label: string; href: string }[] = [
  { value: 'rates', label: 'Rates', href: protectedRoutes.adminPricingRates.path },
  { value: 'spots', label: 'Spots', href: protectedRoutes.adminPricingSpots.path },
]

export type PricingHeaderProps = {
  section: Section
  mobile: boolean
  description: React.ReactNode
  selects?: React.ReactNode
  reset?: React.ReactNode
  count?: React.ReactNode
}

export function PricingHeader({
  section,
  mobile,
  description,
  selects,
  reset,
  count,
}: PricingHeaderProps) {
  const router = useRouter()
  const current = SECTIONS.find((entry) => entry.value === section)

  return (
    <AdminHeader
      title="Pricing"
      layout={mobile ? 'mobile' : 'desktop'}
      nav={<AdminTabs active="pricing" />}
      breadcrumb={
        mobile ? undefined : (
          <Breadcrumb
            linkComponent={NextLink}
            items={[
              { label: 'Admin', href: protectedRoutes.admin.path },
              { label: 'Pricing', href: protectedRoutes.adminPricing.path },
              { label: current?.label },
            ]}
          />
        )
      }
      chips={SECTIONS.map((entry) => (
        <Chip
          key={entry.value}
          label={entry.label}
          selected={entry.value === section}
          aria-current={entry.value === section ? 'page' : undefined}
          onClick={() => router.push(entry.href)}
        />
      ))}
      description={description}
      selects={selects}
      reset={reset}
      count={count}
    />
  )
}
