'use client'

import { Select, cn } from '@dorado/components'

import { useRefinerLocations, useRefinerOptions } from '../_api'

export type RefinerIdentityProps = {
  layout: 'desktop' | 'mobile'
  refinerId: string | null
  locationId: string | null
  onRefiner: (id: string) => void
  onLocation: (id: string) => void
  disabled?: boolean
}

export function RefinerIdentity({
  layout,
  refinerId,
  locationId,
  onRefiner,
  onLocation,
  disabled,
}: RefinerIdentityProps) {
  const refiners = useRefinerOptions().data ?? []
  const organizationId = refiners.find((refiner) => refiner.id === refinerId)?.organization.id
  const locations = useRefinerLocations(organizationId ?? null).data ?? []

  return (
    <div
      className={cn(
        'flex gap-sm',
        layout === 'mobile'
          ? 'flex-col *:w-full'
          : 'flex-row *:w-[320px] [&>*:last-child]:w-[280px]'
      )}
    >
      <Select
        label="Refiner"
        placeholder="Choose a refiner"
        disabled={disabled}
        items={refiners.map((refiner) => ({
          value: refiner.id,
          label: refiner.organization.name,
        }))}
        value={refinerId ?? undefined}
        onValueChange={onRefiner}
      />
      <Select
        label="Location"
        placeholder="Choose a location"
        disabled={disabled || !organizationId}
        items={locations.map((location) => ({
          value: location.id,
          label: [location.name, location.line_1].filter(Boolean).join(' · '),
        }))}
        value={locationId ?? undefined}
        onValueChange={onLocation}
      />
    </div>
  )
}
