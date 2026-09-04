'use client'

// ONE ENTRY IN THE BOOK. It renders what the server sent and calls what the
// server says it may.
//
// It used to decide for itself: Edit and Remove were offered on every card
// including the ones the API refuses with a 409, and the refusal was then
// rendered as red text under the button that should not have been there.
// `entry.actions` is the same rule the use case asserts on, so a button that
// is shown is a call that is accepted.
import type { AddressBookEntry } from '@dorado/contracts'
import * as React from 'react'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { Building2, Button, House } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { useDeleteAddress, useSetDefaultAddress } from '@dorado/client'

type AddressCardVariant = 'default' | 'compact'

export const AddressCard: React.FC<{
  entry: AddressBookEntry
  variant?: AddressCardVariant
  className?: string
  onClick?: () => void
  onEdit?: (entry: AddressBookEntry) => void
  showDefaultBanner?: boolean
  showActions?: boolean
}> = ({
  entry,
  variant = 'default',
  className,
  onClick,
  onEdit,
  showDefaultBanner = true,
  showActions = true,
}) => {
  const { address, user_address, actions } = entry
  const clickable = Boolean(onClick)

  const remove = useDeleteAddress()
  const setDefault = useSetDefaultAddress()

  const [error, setError] = React.useState<string | null>(null)
  const timerRef = React.useRef<number | null>(null)
  const setTimedError = (msg: string) => {
    setError(msg)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setError(null), 5000)
  }
  const settle = (fallback: string) => ({
    onError: (err: Error) => setTimedError(err.message || fallback),
    onSuccess: () => setError(null),
  })

  const busy = remove.isPending || setDefault.isPending

  // The card title's LEVEL carries its size, per ruling 17 - a compact card
  // is an h4, a full one an h3. No type utility, no runtime-conditional class.
  const Title = variant === 'default' ? 'h3' : 'h4'
  const size = variant === 'default' ? 28 : 24
  const Icon = address.is_residential ? House : Building2
  const spacing = variant === 'default' ? 'mt-4' : 'mt-3'

  return (
    <div className={cn('w-full')}>
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!clickable) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
          }
        }}
        className={cn(
          'relative flex w-full bg-card transition-all duration-300 rounded-md overflow-hidden border-1 border-border',
          variant === 'default' ? 'p-4' : 'p-3',
          clickable && 'cursor-pointer hover:-translate-y-[1px] active:translate-y-0',
          className
        )}
      >
        {showDefaultBanner && user_address.default_shipping && (
          <small className="pointer-events-none absolute -right-14 top-3 rotate-45 bg-primary text-primary-foreground px-15 py-1">
            Default
          </small>
        )}

        <div className="flex flex-col w-full">
          <div className="flex items-center gap-2">
            <Icon size={size} className="text-primary" />
            <Title>{user_address.recipient_name}</Title>
            {!!user_address.label && <small>{user_address.label}</small>}
          </div>

          {!!address.phone_number && (
            <p className={spacing}>{formatPhoneNumber(address.phone_number)}</p>
          )}

          <p className={spacing}>
            {address.line_1}
            {address.line_2 ? ` ${address.line_2}` : ''}
            {`, ${address.city}, ${address.state} ${address.zip}`}
          </p>

          {showActions && (
            <div className={cn('flex items-center gap-4 justify-between', spacing)}>
              <div className="flex items-center gap-2">
                {actions.edit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-22"
                    disabled={busy || !onEdit}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit?.(entry)
                    }}
                  >
                    Edit
                  </Button>
                )}
                {actions.remove && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-22"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      remove.mutate(address.id, settle('Failed to remove address.'))
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {actions.set_default && (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDefault.mutate(address.id, settle('Failed to set default address.'))
                  }}
                >
                  Set Default
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* An address an unfinished order depends on offers neither button; this
          says why, instead of a 409 arriving after a click. */}
      {showActions && !actions.edit && !actions.remove && (
        <small className="mt-1 block">In use by an order in progress</small>
      )}
      {error && <p className="mt-1 text-destructive">{error}</p>}
    </div>
  )
}
