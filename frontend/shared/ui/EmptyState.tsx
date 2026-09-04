'use client'

import type { ReactNode } from 'react'
import { EmptyState as LibraryEmptyState } from '@dorado/components'
import { type IconComponent as Icon } from '@dorado/icons'
export type EmptyStateProps = {
  icon: Icon
  /** No longer honoured — the library bakes the icon at 64px. Kept so a call
   *  site passing it still typechecks. */
  iconSize?: number
  badge?: ReactNode
  title: string
  description?: string
  /** The action, usually a `<Button>`. Omit where there is nothing to do. */
  children?: ReactNode
  /** LAYOUT ONLY — vertical rhythm, width, grid placement. */
  className?: string
}

export function EmptyState({ icon: Icon, badge, title, description, children, className }: EmptyStateProps) {
  return (
    <LibraryEmptyState
      icon={<Icon size={64} strokeWidth={1.5} className="text-primary" />}
      badge={badge}
      title={title}
      description={description}
      action={children}
      className={className}
    />
  )
}

export default EmptyState
