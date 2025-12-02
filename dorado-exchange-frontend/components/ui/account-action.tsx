'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

export type AccountActionProps = {
  icon: IconComponent
  label: string
  description?: string

  buttonLabel?: string
  onClick?: () => void
  disabled?: boolean

  iconSize?: number
  iconClassName?: string
  showCheckOnComplete?: boolean
}

export function AccountAction({
  icon,
  label,
  description,
  buttonLabel,
  onClick,
  disabled,
  iconSize = 28,
  iconClassName = 'text-neutral-800',
  showCheckOnComplete = false,
}: AccountActionProps) {
  const Icon = icon

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <Icon
            width={iconSize}
            height={iconSize}
            className={cn('text-neutral-800', iconClassName)}
          />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral-900">{label}</span>
          {description && (
            <span className="text-xs text-neutral-500 leading-tight">{description}</span>
          )}
        </div>
      </div>

      {buttonLabel && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="text-xs py-1 h-8 w-20 md:w-22 raised-off-page"
          onClick={onClick}
          disabled={disabled}
        >
          <span className="flex items-center gap-1">
            {showCheckOnComplete && disabled && <Check size={16} />}
            {buttonLabel}
          </span>
        </Button>
      )}
    </div>
  )
}
