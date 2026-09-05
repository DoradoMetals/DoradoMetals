'use client'

import type { Address } from "@dorado/contracts";
import { motion, AnimatePresence } from 'framer-motion'
import { UserAddress } from '@/shared/types/addresses'
import { cn } from '@/shared/utils/cn'
import { Button, RadioGroup, RadioOption } from '@dorado/components'
import { Building2, ChevronDown, House, Plus } from '@dorado/icons'
import { useEffect, useMemo, useState } from 'react'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

type Props = {
  addresses: Address[]
  // The caller's relationships, joined here by address_id for the default
  // pick and each card's label. Optional: an admin picking for another user
  // may not have them.
  userAddresses?: UserAddress[]
  value?: string | null
  onChange: (addr: Address) => void
  className?: string
  headerAction?: React.ReactNode
  onAddNew?: () => void
  addNewLabel?: string
  title?: string
}

// A ROW, NOT A CARD. AddressCard renders an AddressBookEntry and calls the
// write hooks off its own `actions`; a picker shows a choice and does nothing
// to it, so it draws its own two lines rather than passing an entry it does
// not have. The props stay Address[] + UserAddress[] because the checkout and
// order surfaces that call this hold those.
function AddressRow({
  address,
  link,
}: {
  address: Address
  link?: UserAddress
}) {
  const Icon = address.is_residential ? House : Building2
  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center gap-2">
        <Icon size={24} className="text-primary" />
        <h4>{link?.recipient_name ?? link?.label}</h4>
      </div>
      {!!address.phone_number && <p className="mt-3">{formatPhoneNumber(address.phone_number)}</p>}
      <p className="mt-3">
        {address.line_1}
        {address.line_2 ? ` ${address.line_2}` : ''}
        {`, ${address.city}, ${address.state} ${address.zip}`}
      </p>
    </div>
  )
}

export function AddressSelect({
  addresses,
  userAddresses,
  value,
  onChange,
  className,
  headerAction,
  onAddNew,
  addNewLabel = 'Add New',
  title = 'Addresses',
}: Props) {
  const hasMany = (addresses?.length ?? 0) > 1

  const linkOf = useMemo(
    () => new Map((userAddresses ?? []).map((l) => [l.address_id, l])),
    [userAddresses]
  )

  const selected =
    addresses.find((a) => a.id === value) ??
    addresses.find((a) => linkOf.get(a.id)?.default_shipping) ??
    addresses[0]

  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [value])

  const handleValueChange = (id: string) => {
    const next = addresses.find((a) => a.id === id)
    if (!next) return
    onChange(next)
    setExpanded(false)
  }

  if (!addresses?.length || !selected) return null

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">{title}</p>

        {onAddNew ? (
          <Button
            size="xs"
            variant="secondary"
            className="gap-2"
            onClick={onAddNew}
          >
            <Plus size={16} />
            {addNewLabel}
          </Button>
        ) : (
          <span />
        )}
      </div>

      <div className="rounded-lg overflow-hidden bg-background border border-border">
        <div
          role="button"
          tabIndex={0}
          aria-disabled={!hasMany}
          onClick={() => hasMany && setExpanded((p) => !p)}
          onKeyDown={(e) => {
            if (!hasMany) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setExpanded((p) => !p)
            }
          }}
          className={cn(
            'relative w-full text-left p-3 bg-card flex items-start gap-4',
            'transition-colors rounded-none',
            hasMany ? 'cursor-pointer' : 'cursor-default'
          )}
        >
          <div className="flex items-start w-full justify-between gap-3">
            <div className="flex items-start gap-3 w-full">
              {headerAction ? (
                <div onClick={(e) => e.stopPropagation()} className="shrink-0 pt-0.5">
                  {headerAction}
                </div>
              ) : null}

              <div className="w-full">
                <AddressRow address={selected} link={linkOf.get(selected.id)} />
              </div>
            </div>

            {hasMany && (
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-foreground will-change-transform pt-1"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.div>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && hasMany && (
            <motion.div
              key="address-options"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden will-change-transform"
            >
              {/* The library's RadioOption has no `as` prop, so it cannot be
                  the motion element itself - each row's entrance animation
                  now lives on a wrapping motion.div instead of on the option
                  (label) it used to be. */}
              <RadioGroup
                value={selected.id ?? ''}
                onValueChange={handleValueChange}
                className="flex flex-col gap-2 px-4 py-3"
              >
                {addresses.map((addr, index) => (
                  <motion.div
                    key={addr.id ?? index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                  >
                    <RadioOption
                      value={addr.id ?? ''}
                      variant="card"
                      className="flex-row items-start justify-between gap-4 p-3"
                    >
                      <AddressRow address={addr} link={linkOf.get(addr.id)} />
                    </RadioOption>
                  </motion.div>
                ))}
              </RadioGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
