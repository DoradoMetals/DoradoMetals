import * as React from 'react'
import type { Action } from '@dorado/contracts'
import { Button, cn, type ButtonEmphasis, type ButtonIntent } from '@dorado/components'

export type ActionLook = {
  label: React.ReactNode
  variant?: ButtonEmphasis
  intent?: ButtonIntent
}

export type OfferedAction = Action & { enabled?: boolean }

export type OrderActionButtonsProps = {
  actions: OfferedAction[]
  looks: Record<string, ActionLook>
  onAction: (action: Action) => void
  layout?: 'desktop' | 'mobile'
  size?: 'sm' | 'default' | 'lg'
  pending?: string | null
  bare?: boolean
  className?: string
}

export function offeredActions(actions: OfferedAction[], looks: Record<string, ActionLook>) {
  return Object.keys(looks).flatMap((name) => {
    const action = actions.find((candidate) => candidate.name === name)
    return action ? [action] : []
  })
}

export function OrderActionButtons({
  actions,
  looks,
  onAction,
  layout = 'desktop',
  size = 'sm',
  pending = null,
  bare = false,
  className,
}: OrderActionButtonsProps) {
  const offered = offeredActions(actions, looks)
  if (offered.length === 0) return null
  const mobile = layout === 'mobile'
  const ordered = mobile ? [...offered].reverse() : offered
  const buttons = ordered.map((action) => {
    const look = looks[action.name]
    return (
      <Button
        key={action.name}
        size={size}
        variant={look.variant ?? 'secondary'}
        intent={look.intent ?? 'neutral'}
        disabled={pending === action.name || action.enabled === false}
        className={mobile ? 'w-full' : undefined}
        onClick={() => onAction(action)}
      >
        {look.label}
      </Button>
    )
  })
  if (bare) return <>{buttons}</>
  return (
    <div
      data-layout={layout}
      className={cn(mobile ? 'flex w-full flex-col gap-xs' : 'flex items-center gap-xs', className)}
    >
      {buttons}
    </div>
  )
}
