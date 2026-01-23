'use client'

import { ComponentType } from 'react'
import { RowsPlusTopIcon } from '@phosphor-icons/react'

import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'

type AddNewTriggerProps = {
  onOpen: () => void
  icon?: ComponentType<{ size?: number; className?: string }>
  className?: string
}

export function AddNewTrigger({
  onOpen,
  icon: Icon = RowsPlusTopIcon,
  className = 'bg-highest hover:bg-highest border-1 border-border',
}: AddNewTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('text-neutral-800 h-10', className)}
      onClick={onOpen}
    >
      <Icon size={28} />
    </Button>
  )
}
