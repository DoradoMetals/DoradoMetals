'use client'

import * as React from 'react'
import { Building2, House } from 'lucide-react'

import { Address } from '@/features/addresses/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/lib/utils'
import { useDeleteAddress, useSetDefaultAddress } from '@/features/addresses/queries'

export type AddressCardVariant = 'default' | 'compact'
type IconKind = 'auto' | 'home' | 'office' | 'none'

export interface AddressCardProps {
  address: Address
  variant?: AddressCardVariant
  className?: string
  onClick?: () => void
  onEdit?: (address: Address) => void
  icon?: IconKind
  showDefaultBanner?: boolean
  showEdit?: boolean
  showRemove?: boolean
  showSetDefault?: boolean
  raised?: boolean
}

export const AddressCard: React.FC<AddressCardProps> = ({
  address,
  variant = 'default',
  className,
  onClick,
  onEdit,
  icon = 'auto',
  showDefaultBanner = true,
  showEdit = true,
  showRemove = true,
  showSetDefault = true,
  raised = true,
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
          className,
          raised === true && 'raised-off-page'
        )}
      >
        {showDefaultBanner && address.is_default && (
          <>
            <span className="pointer-events-none absolute -right-14 top-3 rotate-45 bg-primary text-white text-xs px-15 py-1">
              Default
            </span>
          </>
        )}

        <div className="flex flex-col w-full">
          <div className="flex items-start justify-between w-full">
            <div className="flex items-center gap-2">
              {renderIcon()}
              <div
                className={cn(
                  'text-neutral-900',
                  variant === 'default' ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
                )}
              >
                {address.name}
              </div>
            </div>
          </div>

          {!!address.phone_number && (
            <div
              className={cn(
                'text-neutral-700',
                variant === 'default' ? 'text-sm md:text-base mt-4' : 'text-xs mt-3'
              )}
            >
              {formatPhoneNumber(address.phone_number)}
            </div>
          )}

          <div
            className={cn(
              'text-neutral-700',
              variant === 'default' ? 'text-sm md:text-base mt-4' : 'text-xs mt-3'
            )}
          >
            <p>
              {address.line_1}
              {address.line_2 ? ` ${address.line_2}` : ''}
              {`, ${address.city}, ${address.state} ${address.zip}`}
            </p>
          </div>

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
                    className="px-4 py-0 min-w-22 text-sm md:text-base"
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
                    variant="default"
                    size="sm"
                    className="px-4 py-0 min-w-22 text-sm md:text-base border-1 border-neutral-700 bg-card text-neutral-700 hover:bg-neutral-900 hover:text-neutral-100"
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

              {showSetDefault && !address.is_default && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-neutral-700 hover:text-neutral-900"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDefaultAddressMutation.mutate(address, {
                      onError: (err: any) => {
                        const msg =
                          err?.response?.data?.error ||
                          err?.message ||
                          'Failed to set default address.'
                        setTimedError(msg)
                      },
                      onSuccess: () => setError(null),
                    })
                  }}
                >
                  Set Default
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mt-1 text-xs text-destructive font-normal">{error}</div>}
    </div>
  )
}
