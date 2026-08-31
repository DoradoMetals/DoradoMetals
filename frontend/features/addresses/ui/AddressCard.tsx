'use client'

import * as React from 'react'
import { Building2, House } from 'lucide-react'

import { Address, UserAddress } from '@/features/addresses/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { useDeleteAddress, useSetDefaultAddress } from '@/features/addresses/queries'

type AddressCardVariant = 'default' | 'compact'
type IconKind = 'auto' | 'home' | 'office' | 'none'

interface AddressCardProps {
  address: Address
  variant?: AddressCardVariant
  className?: string
  onClick?: () => void
  // The caller's relationship - label and default flag - joined by the
  // parent from its own endpoint. Optional: a card can render a bare
  // address (an order snapshot has no relationship).
  userAddress?: UserAddress | null
  onEdit?: (address: Address, userAddress?: UserAddress | null) => void
  icon?: IconKind
  showDefaultBanner?: boolean
  showEdit?: boolean
  showRemove?: boolean
  showSetDefault?: boolean
}

export const AddressCard: React.FC<AddressCardProps> = ({
  address,
  userAddress,
  variant = 'default',
  className,
  onClick,
  onEdit,
  icon = 'auto',
  showDefaultBanner = true,
  showEdit = true,
  showRemove = true,
  showSetDefault = true,
}) => {
  const clickable = Boolean(onClick)
  const showActions = showEdit || showRemove || showSetDefault

  const deleteAddressMutation = useDeleteAddress()
  const setDefaultAddressMutation = useSetDefaultAddress()

  const [error, setError] = React.useState<string | null>(null)
  const timerRef = React.useRef<number | null>(null)
  const setTimedError = (msg: string) => {
    setError(msg)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setError(null), 5000)
  }

  const busy = deleteAddressMutation.isPending || setDefaultAddressMutation.isPending

  // The card title's LEVEL carries its size, per ruling 17 — a compact card
  // is an h4, a full one an h3. No type utility, no runtime-conditional class.
  const Title = variant === 'default' ? 'h3' : 'h4'

  const size = variant === 'default' ? 28 : 24
  const renderIcon = () => {
    if (icon === 'none') return null
    const useHome = icon === 'home' || (icon === 'auto' && !!address.is_residential)
    return useHome ? (
      <House size={size} className="text-primary" />
    ) : (
      <Building2 size={size} className="text-primary" />
    )
  }

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
        {showDefaultBanner && userAddress?.default_shipping && (
          <>
            <small className="pointer-events-none absolute -right-14 top-3 rotate-45 bg-primary text-primary-foreground px-15 py-1">
              Default
            </small>
          </>
        )}

        <div className="flex flex-col w-full">
          <div className="flex items-start justify-between w-full">
            <div className="flex items-center gap-2">
              {renderIcon()}
              <Title>{userAddress?.label}</Title>
            </div>
          </div>

          {!!address.phone_number && (
            <p className={variant === 'default' ? 'mt-4' : 'mt-3'}>
              {formatPhoneNumber(address.phone_number)}
            </p>
          )}

          <p className={variant === 'default' ? 'mt-4' : 'mt-3'}>
            {address.line_1}
            {address.line_2 ? ` ${address.line_2}` : ''}
            {`, ${address.city}, ${address.state} ${address.zip}`}
          </p>

          {showActions && (
            <div
              className={cn(
                'flex items-center gap-4 justify-between',
                variant === 'default' ? 'mt-4' : 'mt-3'
              )}
            >
              <div className="flex items-center gap-2">
                {showEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-22"
                    disabled={busy || !onEdit}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit?.(address)
                    }}
                  >
                    Edit
                  </Button>
                )}
                {showRemove && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-22"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteAddressMutation.mutate(address, {
                        onError: (err: any) => {
                          const msg =
                            err?.response?.data?.error ||
                            err?.message ||
                            'Failed to remove address.'
                          setTimedError(msg)
                        },
                        onSuccess: () => setError(null),
                      })
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {showSetDefault && !userAddress?.default_shipping && (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDefaultAddressMutation.mutate(
                      userAddress ?? { address_id: address.id, user_id: null, label: null, default_shipping: false },
                      {
                      onError: (err: any) => {
                        const msg =
                          err?.response?.data?.error ||
                          err?.message ||
                          'Failed to set default address.'
                        setTimedError(msg)
                      },
                      onSuccess: () => setError(null),
                    }
                    )
                  }}
                >
                  Set Default
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-destructive">{error}</p>}
    </div>
  )
}
