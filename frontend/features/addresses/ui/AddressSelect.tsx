'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Plus } from 'lucide-react'
import { Address, UserAddress } from '@/features/addresses/types'
import { cn } from '@/shared/utils/cn'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { Button } from '@/shared/ui/base/button'
import { useEffect, useMemo, useState } from 'react'
import { AddressCard } from '@/features/addresses/ui/AddressCard'

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
                <AddressCard
                  variant="compact"
                  address={selected}
                  userAddress={linkOf.get(selected.id)}
                  icon="auto"
                  showDefaultBanner={false}
                  showEdit={false}
                  showRemove={false}
                  showSetDefault={false}
                  className="bg-transparent border-none p-0"
                />
              </div>
            </div>

            {hasMany && (
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-neutral-800 will-change-transform pt-1"
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
              <RadioGroup
                value={selected.id ?? ''}
                onValueChange={handleValueChange}
                className="flex flex-col gap-2 px-4 py-3"
              >
                {addresses.map((addr, index) => (
                  <motion.label
                    key={addr.id ?? index}
                    htmlFor={addr.id ?? ''}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={cn(
                      'relative flex w-full items-start justify-between gap-4 border border-border',
                      'rounded-lg p-3 cursor-pointer transition-colors',
                      'has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-neutral-900',
                      'hover:border-neutral-900 hover:bg-card'
                    )}
                  >
                    <AddressCard
                      variant="compact"
                      address={addr}
                      userAddress={linkOf.get(addr.id)}
                      icon="auto"
                      showDefaultBanner={false}
                      showEdit={false}
                      showRemove={false}
                      showSetDefault={false}
                      className="bg-transparent border-0 p-0 pr-10"
                    />

                    <div className="absolute right-3 top-3">
                      <RadioGroupItem id={addr.id ?? ''} value={addr.id ?? ''} />
                    </div>
                  </motion.label>
                ))}
              </RadioGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
