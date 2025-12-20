'use client'

import * as React from 'react'
import { Building2, House } from 'lucide-react'

import { Address } from '@/features/addresses/types'
import formatPhoneNumber from '@/utils/formatting/formatPhoneNumber'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDeleteAddress, useSetDefaultAddress } from '@/features/addresses/queries'

export type AddressCardVariant = 'default' | 'compact'
export type AddressCardMode = 'customer' | 'admin'

export interface AddressCardProps {
  address: Address
  variant?: AddressCardVariant
  className?: string

  mode?: AddressCardMode
  onClick?: () => void
  onEdit?: (address: Address) => void

  showEdit?: boolean
  showRemove?: boolean
  showSetDefault?: boolean
}

export const AddressCard: React.FC<AddressCardProps> = ({
  address,
  variant = 'default',
  className,
  mode = 'admin',
  onClick,
  onEdit,
  showEdit = true,
  showRemove = true,
  showSetDefault = true,
}) => {
  const clickable = Boolean(onClick)
  const showActions = mode === 'customer'

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

  return (
    <div className={cn('w-full', className)}>
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
          'flex w-full bg-card transition-all duration-300 rounded-xl raised-off-page',
          variant === 'default' ? 'p-4' : 'p-3',
          clickable && 'cursor-pointer hover:-translate-y-[1px] active:translate-y-0'
        )}
      >
        <div className="flex flex-col w-full">
          <div className="flex items-start justify-between w-full">
            <div className={cn('text-neutral-900', variant === 'default' ? 'text-xl' : 'text-base')}>
              {address.name}
            </div>

            <div className="text-secondary">
              {address.is_residential ? (
                <House size={variant === 'default' ? 24 : 20} className="text-neutral-600" />
              ) : (
                <Building2 size={variant === 'default' ? 24 : 20} className="text-neutral-600" />
              )}
            </div>
          </div>

          {!!address.phone_number && (
            <div className={cn('text-neutral-600', variant === 'default' ? 'text-sm' : 'text-xs')}>
              {formatPhoneNumber(address.phone_number)}
            </div>
          )}

          <div className={cn('text-neutral-600', variant === 'default' ? 'text-base mt-4' : 'text-sm mt-3')}>
            <p>
              {address.line_1}
              {address.line_2 && `, ${address.line_2}`}
            </p>
            <p>{`${address.city}, ${address.state}, ${address.zip}`}</p>
          </div>

          {showActions && (
            <div className={cn('flex items-center gap-4 justify-between', variant === 'default' ? 'mt-4' : 'mt-3')}>
              <div className="flex items-center gap-2">
                {showEdit && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="px-4 min-w-[80px] bg-primary raised-off-page text-white"
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
                    className="bg-card raised-off-page px-4 min-w-[80px] text-primary"
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
                  className="text-primary p-0 h-auto"
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
