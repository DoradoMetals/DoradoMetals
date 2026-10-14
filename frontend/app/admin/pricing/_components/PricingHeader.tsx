'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminHeader, Breadcrumb, Chip, Tabs, TabsList, TabsTrigger } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

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
      nav={
        <Tabs value="pricing">
          <TabsList aria-label="Admin">
            <TabsTrigger value="orders" disabled>
              Orders
            </TabsTrigger>
            <TabsTrigger value="inventory" disabled>
              Inventory
            </TabsTrigger>
            <TabsTrigger value="people" disabled>
              People
            </TabsTrigger>
            <TabsTrigger value="pricing" onClick={() => router.push(protectedRoutes.admin.path)}>
              Pricing
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
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
