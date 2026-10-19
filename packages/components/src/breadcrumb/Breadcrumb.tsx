'use client'

import * as React from 'react'
import { ChevronRight } from '@dorado/icons'

import { cn } from '../cn'
import { Link } from '../link/Link'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu'

export type BreadcrumbCrumb = {
  label: React.ReactNode
  href?: string
}

export type BreadcrumbProps = {
  items: BreadcrumbCrumb[]
  depth?: 'full' | 'collapsed'
  linkComponent?: React.ElementType
  className?: string
}

function Separator() {
  return <ChevronRight aria-hidden className="size-3.5 shrink-0 text-placeholder" />
}

function Crumb({
  crumb,
  linkComponent: LinkComponent = 'a',
}: {
  crumb: BreadcrumbCrumb
  linkComponent?: React.ElementType
}) {
  if (!crumb.href) return <span className="text-small text-muted-foreground">{crumb.label}</span>
  return (
    <Link asChild intent="muted" className="font-normal">
      <LinkComponent href={crumb.href}>{crumb.label}</LinkComponent>
    </Link>
  )
}

export function Breadcrumb({ items, depth = 'full', linkComponent, className }: BreadcrumbProps) {
  if (items.length === 0) return null
  const current = items[items.length - 1]
  const trail = items.slice(0, -1)
  const folds = depth === 'collapsed' && items.length > 3
  const hidden = folds ? trail.slice(1) : []
  const shown = folds ? trail.slice(0, 1) : trail

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex min-h-(--control-xs) flex-wrap items-center gap-xs">
        {shown.map((crumb, index) => (
          <li key={index} className="flex items-center gap-xs">
            <Crumb crumb={crumb} linkComponent={linkComponent} />
            <Separator />
          </li>
        ))}
        {folds && (
          <li className="flex items-center gap-xs">
            <Menu>
              <MenuTrigger
                aria-label="Show hidden crumbs"
                className="cursor-pointer rounded-sm text-small text-muted-foreground hover:text-foreground focus-ring"
              >
                …
              </MenuTrigger>
              <MenuContent align="start">
                {hidden.map((crumb, index) =>
                  crumb.href ? (
                    <MenuItem key={index} asChild>
                      {React.createElement(linkComponent ?? 'a', { href: crumb.href }, crumb.label)}
                    </MenuItem>
                  ) : (
                    <MenuItem key={index} disabled>
                      {crumb.label}
                    </MenuItem>
                  )
                )}
              </MenuContent>
            </Menu>
            <Separator />
          </li>
        )}
        <li className="flex items-center">
          <span aria-current="page" className="text-small font-medium text-foreground">
            {current.label}
          </span>
        </li>
      </ol>
    </nav>
  )
}
