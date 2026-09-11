'use client'

import { Badge, Button, Select, Text } from '@dorado/components'
import type { AdminUser, Location } from '@dorado/contracts'

export type OrderHeaderParty =
  | { kind: 'customer'; name: string; place: string; ordersToDate: number | null }
  | {
      kind: 'refiner'
      refinerId: string | null
      refiners: { id: string; name: string }[]
      onRefinerChange: (id: string) => void
      locked: boolean
      place: string
      ordersToDate: number | null
    }

export type OrderHeaderOffice = {
  locations: Location[]
  locationId: string | null
  onChange: (id: string) => void
  disabled?: boolean
}

export type OrderHeaderAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  reason?: string
}

export type OrderHeaderCardProps = {
  eyebrow: string
  reference: string
  party: OrderHeaderParty
  cancelled?: boolean
  assignedToId: string | null
  admins: AdminUser[]
  onAssign: (id: string) => void
  assignDisabled?: boolean
  cancel?: OrderHeaderAction
  primary?: OrderHeaderAction
  reopen?: OrderHeaderAction
  office?: OrderHeaderOffice
}

// PURCHASE ORDER / SALES ORDER, who it is with, where it is, and the two things
// an admin may do to the order itself. The Cancelled badge earns its place here
// because it stops every other card; no other order-level status does, so none
// is drawn.
export function OrderHeaderCard({
  eyebrow,
  reference,
  party,
  cancelled = false,
  assignedToId,
  admins,
  onAssign,
  assignDisabled = false,
  cancel,
  primary,
  reopen,
  office,
}: OrderHeaderCardProps) {
  const meta = party.place
  const shown = (cancelled ? [reopen] : [cancel, primary]).filter(
    (action): action is OrderHeaderAction => action != null
  )
  const blocked = shown.filter((a) => a.disabled && a.reason).map((a) => a.reason!)

  return (
    <section className="flex flex-col gap-lg overflow-clip rounded-lg border border-border bg-card p-md lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-xs">
        <div className="flex items-center gap-xs">
          <Text variant="eyebrow" emphasis="subtlest">
            {eyebrow}
          </Text>
          {cancelled && (
            <Badge intent="danger" variant="soft">
              Cancelled
            </Badge>
          )}
        </div>

        {party.kind === 'customer' ? (
          <h2 className="truncate">{party.name}</h2>
        ) : (
          <div className="w-full lg:w-[320px]">
            <Select
              label="Refiner"
              items={party.refiners.map((r) => ({ value: r.id, label: r.name }))}
              value={party.refinerId ?? undefined}
              onValueChange={party.onRefinerChange}
              disabled={party.locked}
              placeholder="Choose a refiner"
            />
          </div>
        )}

        <p className="text-small text-muted-foreground">
          {meta ? `${reference}   ·   ${meta}` : reference}
        </p>
        {party.ordersToDate !== null && (
          <p className="text-small text-muted-foreground">
            {party.ordersToDate} orders to date
          </p>
        )}
        {office && (
          <div className="w-full pt-2xs lg:w-[320px]">
            <Select
              label="Office"
              items={office.locations.map((one) => ({
                value: one.id,
                label: one.name ?? one.type ?? one.id,
              }))}
              value={office.locationId ?? undefined}
              onValueChange={office.onChange}
              disabled={office.disabled}
              placeholder="Choose an office"
            />
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-xs lg:w-[240px] lg:shrink-0 lg:items-end">
        <Select
          label="Assigned to"
          items={admins.map((a) => ({ value: a.id, label: a.name ?? a.email }))}
          value={assignedToId ?? undefined}
          onValueChange={onAssign}
          disabled={assignDisabled}
          placeholder="Unassigned"
        />
        <div className="flex w-full items-center gap-sm">
          {shown.map((action) => (
            <Button
              key={action.label}
              variant={action.label.startsWith('Cancel') ? 'secondary' : 'primary'}
              intent={action.label.startsWith('Cancel') ? 'danger' : 'neutral'}
              size="lg"
              disabled={action.disabled}
              onClick={action.onClick}
              className="flex-1"
            >
              {action.label}
            </Button>
          ))}
        </div>
        {blocked.length > 0 && (
          <p className="text-micro text-muted-foreground lg:text-right">
            {blocked.join(' · ')}
          </p>
        )}
      </div>
    </section>
  )
}
