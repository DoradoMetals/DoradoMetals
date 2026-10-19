'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { ChevronDown } from '@dorado/icons'
import { FieldLabel, fieldPanel, fieldTrigger } from '../field/Field'
import { cn } from '../cn'

const triggerState = cva('', {
  variants: {
    state: {
      default: '',
      focus: 'border-(length:--stroke-emphasis) border-border-strong',
      error: 'border-destructive',
      disabled: 'bg-muted text-muted-foreground',
    },
  },
  defaultVariants: { state: 'default' },
})

export type PopoverState = 'default' | 'focus' | 'error' | 'disabled'

export type PopoverProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  label?: React.ReactNode
  value?: React.ReactNode
  placeholder?: React.ReactNode
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  panel?: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  state?: PopoverState
}

export function Popover({
  label,
  value,
  placeholder = 'Select an option',
  leadingIcon,
  trailingIcon,
  panel,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  state = 'default',
  className,
  ...props
}: PopoverProps) {
  const id = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelId = `${id}-panel`
  const [openState, setOpenState] = React.useState(defaultOpen)
  const open = (openProp ?? openState) && state !== 'disabled'

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, setOpen])

  const filled = value != null && value !== ''

  return (
    <div
      ref={rootRef}
      className={cn('relative flex w-full flex-col gap-3xs', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
      {...props}
    >
      {label != null && (
        <FieldLabel htmlFor={id} className={cn(state === 'error' && 'text-destructive')}>
          {label}
        </FieldLabel>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && panel != null ? panelId : undefined}
        aria-invalid={state === 'error' || undefined}
        disabled={state === 'disabled'}
        onClick={() => setOpen(!open)}
        className={cn(fieldTrigger(), triggerState({ state }), 'cursor-pointer text-left')}
      >
        {leadingIcon != null && (
          <span aria-hidden className="flex shrink-0 items-center text-muted-foreground">
            {leadingIcon}
          </span>
        )}
        <span className={cn('min-w-0 flex-1 truncate', !filled && 'text-placeholder')}>
          {filled ? value : placeholder}
        </span>
        <span
          aria-hidden
          className={cn(
            'flex shrink-0 items-center text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        >
          {trailingIcon ?? <ChevronDown className="size-4" />}
        </span>
      </button>
      {open && panel != null && (
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={id}
          className={cn(fieldPanel(), 'absolute left-0 top-full mt-3xs w-full')}
        >
          {panel}
        </div>
      )}
    </div>
  )
}
