'use client'

import * as React from 'react'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@dorado/components'

export type OrderContextMenuAction = {
  name: string
  label: string
  disabled?: boolean
  icon?: React.ReactNode
  intent?: 'neutral' | 'danger'
}

export type OrderContextMenuProps = {
  reference: React.ReactNode
  actions: OrderContextMenuAction[]
  onAction: (name: string) => void
  labelPrefix?: React.ReactNode
  disabled?: boolean
  children: React.ReactNode
}

export function OrderContextMenu({
  reference,
  actions,
  onAction,
  labelPrefix = 'Order',
  disabled = false,
  children,
}: OrderContextMenuProps) {
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null)
  const open = point != null
  const firstDanger = actions.findIndex((a) => a.intent === 'danger')

  return (
    <Menu open={open} onOpenChange={(next) => !next && setPoint(null)}>
      <div
        className="contents"
        onContextMenu={(event) => {
          if (disabled || actions.length === 0) return
          event.preventDefault()
          setPoint({ x: event.clientX, y: event.clientY })
        }}
      >
        {children}
      </div>
      <MenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: point?.x ?? 0, top: point?.y ?? 0 }}
        />
      </MenuTrigger>
      <MenuContent align="start" sideOffset={0} className="w-60">
        <MenuLabel>
          {labelPrefix} {reference}
        </MenuLabel>
        {actions.map((action, index) => (
          <React.Fragment key={action.name}>
            {index === firstDanger && index > 0 && <MenuSeparator className="my-0!" />}
            <MenuItem
              intent={action.intent}
              className={action.intent === 'danger' ? undefined : '[&_svg]:text-foreground'}
              disabled={action.disabled}
              onSelect={() => onAction(action.name)}
            >
              {action.icon}
              {action.label}
            </MenuItem>
          </React.Fragment>
        ))}
      </MenuContent>
    </Menu>
  )
}
