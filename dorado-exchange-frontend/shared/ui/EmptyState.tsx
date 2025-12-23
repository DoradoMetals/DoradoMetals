'use client'

import { Button } from '@/shared/ui/base/button'
import { cn } from '@/lib/utils'
import { Icon } from '@phosphor-icons/react'

type Props = {
  // main icon
  icon: Icon
  iconSize?: number
  iconClassName?: string
  title: string
  description?: string
  buttonLabel: string
  onClick: () => void
  buttonIcon?: Icon
  buttonIconSize?: number

  className?: string
  buttonVariant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive'
  buttonClassName?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function EmptyState({
  icon: Icon,
  iconSize = 128,
  iconClassName = 'text-primary',
  title,
  description,
  buttonLabel,
  onClick,
  buttonIcon: ButtonIcon,
  buttonIconSize = 18,
  className,
  buttonVariant = 'default',
  buttonClassName,

  titleClassName,
  descriptionClassName,
}: Props) {
  return (
    <div className={cn('w-full px-6 py-10 flex flex-col items-center text-center', className)}>
      <Icon className={cn(iconClassName)} size={iconSize} />

      <div
        className={cn(
          'mt-4 text-lg md:text-xl font-medium text-neutral-900',
          titleClassName
        )}
      >
        {title}
      </div>

      {description ? (
        <div
          className={cn(
            'mt-1 text-xs text-neutral-600 leading-relaxed max-w-xs',
            descriptionClassName
          )}
        >
          {description}
        </div>
      ) : null}

      <Button
        type="button"
        variant={buttonVariant}
        onClick={onClick}
        className={cn('mt-6 h-10 px-8 raised-off-page', buttonClassName)}
      >
        <span className="flex items-center gap-2">
          {ButtonIcon ? <ButtonIcon size={buttonIconSize} /> : null}
          {buttonLabel}
        </span>
      </Button>
    </div>
  )
}
