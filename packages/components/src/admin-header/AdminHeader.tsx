import * as React from 'react'

import { cn } from '../cn'

export type AdminHeaderProps = {
  title: React.ReactNode
  layout?: 'desktop' | 'mobile'
  nav?: React.ReactNode
  breadcrumb?: React.ReactNode
  chips?: React.ReactNode
  description?: React.ReactNode
  search?: React.ReactNode
  action?: React.ReactNode
  radio?: React.ReactNode
  radioLabel?: React.ReactNode
  selects?: React.ReactNode
  reset?: React.ReactNode
  className?: string
}

export function AdminHeader({
  title,
  layout = 'desktop',
  nav,
  breadcrumb,
  chips,
  description,
  search,
  action,
  radio,
  radioLabel,
  selects,
  reset,
  className,
}: AdminHeaderProps) {
  const mobile = layout === 'mobile'
  const toolbar = radio != null || selects != null || reset != null

  return (
    <section
      className={cn('flex flex-col rounded-lg border border-border bg-card', className)}
      data-layout={layout}
    >
      {nav != null && (
        <div className={cn('pt-xs-plus', mobile ? 'px-md' : 'px-lg')}>
          <div className="flex items-center gap-2xs border-b border-border">{nav}</div>
        </div>
      )}

      {mobile ? (
        <div className="flex flex-col gap-sm px-md pb-md pt-sm">
          {breadcrumb}
          <div className="flex flex-col gap-xs">
            <h1 className="stat-xs text-foreground">{title}</h1>
            {description != null && (
              <p className="text-small text-muted-foreground">{description}</p>
            )}
          </div>
          {chips != null && <div className="flex flex-wrap gap-xs">{chips}</div>}
          {search != null && <div className="flex flex-col">{search}</div>}
          {action != null && <div className="flex flex-col">{action}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-sm px-lg pb-md-plus pt-sm">
          <div className="flex items-end justify-between gap-lg">
            <div className="flex flex-col gap-xs">
              <div className="flex items-center gap-md">
                <h1 className="text-h2 text-foreground">{title}</h1>
                {chips != null && <div className="flex gap-xs">{chips}</div>}
              </div>
              {description != null && (
                <p className="text-small text-muted-foreground">{description}</p>
              )}
            </div>
            {(breadcrumb != null || search != null || action != null) && (
              <div className="flex flex-col items-end gap-xs">
                {breadcrumb}
                {(search != null || action != null) && (
                  <div className="flex items-center gap-sm">
                    {search}
                    {action}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {toolbar &&
        (mobile ? (
          <div className="flex flex-col gap-xs-plus px-md py-sm">
            <div aria-hidden className="h-px w-full bg-border" />
            {radio != null && <div className="flex flex-col">{radio}</div>}
            {selects != null && <div className="grid grid-cols-2 gap-xs">{selects}</div>}
            {reset != null && <div className="flex items-center justify-end gap-sm">{reset}</div>}
          </div>
        ) : (
          <div className="px-lg pb-md">
            <div className="flex items-end justify-between gap-lg border-t border-border pt-md">
              <div className="flex flex-1 items-end gap-lg">
                {radio != null && (
                  <div className="flex flex-col gap-3xs">
                    {radioLabel != null && (
                      <span className="micro font-medium text-muted-foreground">{radioLabel}</span>
                    )}
                    {radio}
                  </div>
                )}
                {selects}
              </div>
              {reset != null && <div className="flex flex-col items-end gap-2xs">{reset}</div>}
            </div>
          </div>
        ))}
    </section>
  )
}
