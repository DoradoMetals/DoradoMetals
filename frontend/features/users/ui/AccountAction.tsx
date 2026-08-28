'use client'

import * as React from 'react'
import { Button } from '@/shared/ui/base/button'
import { Check } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

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
          <strong>{label}</strong>
          {description && <small>{description}</small>}
        </div>
      </div>

      {buttonLabel && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-20 md:w-22"
          onClick={onClick}
          disabled={disabled}
        >
          {showCheckOnComplete && disabled && <Check size={16} />}
          {buttonLabel}
        </Button>
      )}
    </div>
  )
}
