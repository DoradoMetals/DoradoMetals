'use client'

import * as React from 'react'
import { MenuIcon, X } from '@dorado/icons'

import { cn } from '../cn'
import { Button } from '../button/Button'

export type HeaderProps = {
  brand: React.ReactNode
  nav?: React.ReactNode
  trailing?: React.ReactNode
  mobileTrailing?: React.ReactNode
  drawerOpen?: boolean
  onDrawerToggle?: () => void
  className?: string
}

export function Header({
  brand,
  nav,
  trailing,
  mobileTrailing,
  drawerOpen = false,
  onDrawerToggle,
  className,
}: HeaderProps) {
  return (
    <header
      className={cn(
        'flex h-18 w-full items-center justify-between border-b border-border bg-background px-md lg:h-3xl lg:px-xl',
        className
      )}
    >
      {brand}

      <div className="hidden items-center lg:flex">
        {drawerOpen ? (
          <Button
            variant="tertiary"
            size="icon"
            aria-label="Close menu"
            aria-expanded={drawerOpen}
            onClick={onDrawerToggle}
          >
            <X aria-hidden />
          </Button>
        ) : (
          <div className="flex items-center gap-lg">
            {nav && (
              <nav aria-label="Primary" className="flex items-center gap-lg">
                {nav}
              </nav>
            )}
            {nav && trailing && <span aria-hidden className="h-md-plus w-px shrink-0 bg-border" />}
            {trailing}
          </div>
        )}
      </div>

      <div className="flex items-center gap-md lg:hidden">
        {mobileTrailing}
        {onDrawerToggle && (
          <Button
            variant="tertiary"
            size="icon"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={onDrawerToggle}
          >
            <MenuIcon open={drawerOpen} aria-hidden />
          </Button>
        )}
      </div>
    </header>
  )
}
