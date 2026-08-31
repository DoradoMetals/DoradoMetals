'use client'

import { ComponentType } from 'react'
import { RowsPlusTopIcon } from '@phosphor-icons/react'

import { Button } from '@dorado/components'
import { cn } from '@/shared/utils/cn'

type AddNewTriggerProps = {
  onOpen: () => void
  icon?: ComponentType<{ size?: number; className?: string }>
  className?: string
  /**
   * What this button creates, e.g. "Lead". Becomes the accessible name.
   */
  label?: string
}

export function AddNewTrigger({
  onOpen,
  icon: Icon = RowsPlusTopIcon,
  className = 'bg-transparent border border-border',
  label,
}: AddNewTriggerProps) {
  // AN ICON-ONLY BUTTON NEEDS AN ACCESSIBLE NAME. Without one a screen reader
  // announces "button" and nothing else, so the only way to create anything in
  // the admin area was to recognise the glyph. Five of the first twenty buttons
  // on the leads section had no accessible name at all; this is one of them,
  // found while trying to write a test that clicks it.
  //
  // Falls back to a generic label rather than requiring every call site to pass
  // one, so no caller regresses to nameless.
  const accessibleName = label ? `Create ${label}` : 'Create new'
  return (
    <Button
      variant="tertiary"
      size="sm"
      className={cn(className)}
      onClick={onOpen}
      aria-label={accessibleName}
      title={accessibleName}
    >
      <Icon size={28} />
    </Button>
  )
}
