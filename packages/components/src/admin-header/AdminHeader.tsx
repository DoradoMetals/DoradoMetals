import * as React from 'react'

import { cn } from '../cn'

export type AdminHeaderProps = {
  title: React.ReactNode
  layout?: 'desktop' | 'mobile'
  nav?: React.ReactNode
  breadcrumb?: React.ReactNode
  chips?: React.ReactNode
  totals?: React.ReactNode
  search?: React.ReactNode
  action?: React.ReactNode
  radio?: React.ReactNode
  radioLabel?: React.ReactNode
  selects?: React.ReactNode
  filters?: React.ReactNode
  reset?: React.ReactNode
  count?: React.ReactNode
  className?: string
}

export function AdminHeader({
  title,
  layout = 'desktop',
  nav,
  breadcrumb,
  chips,
  totals,
  search,
  action,
  radio,
  radioLabel,
  selects,
  filters,
  reset,
  count,
  className,
}: AdminHeaderProps) {
  const mobile = layout === 'mobile'
  const toolbar =
    radio != null || selects != null || filters != null || reset != null || count != null
  const countLine = <p className="micro text-muted-foreground">{count ?? '\u00a0'}</p>

  return (
    <section
      className={cn('flex flex-col rounded-lg border border-border bg-card', className)}
      data-layout={layout}
    >
      {nav != null && (
        <div className={cn('pt-xs-plus', mobile ? 'px-md' : 'px-lg')}>
          <div
            className={cn(
              'relative flex items-center gap-2xs',
              '[&_[role=tablist]]:border-b-0 [&_[role=tab]:first-child]:pl-0',
              mobile && '[&_[role=tab]:last-of-type]:pr-0'
            )}
          >
            {nav}
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" />
          </div>
        </div>
      )}

      {mobile ? (
        <div className="flex flex-col gap-sm px-md pb-md pt-sm">
          {breadcrumb}
          <div className="flex flex-col gap-xs">
            <h1 className="stat-xs text-foreground">{title}</h1>
            {totals != null && (
              <p data-part="totals" className="text-small text-muted-foreground">
                {totals}
              </p>
            )}
          </div>
          {chips != null && <div className="flex flex-wrap gap-xs">{chips}</div>}
          {(search != null || action != null) && (
            <span aria-hidden data-part="head-divider" className="h-px w-full bg-border" />
          )}
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
              {totals != null && (
                <p data-part="totals" className="text-small text-muted-foreground">
                  {totals}
                </p>
              )}
            </div>
            {(breadcrumb != null || search != null || action != null) && (
              <div className="flex flex-col items-end gap-xs">
                {breadcrumb}
                <div className="flex min-h-(--control-lg) items-center gap-sm">
                  {search}
                  {action}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toolbar &&
        (mobile ? (
          <div className="relative flex flex-col gap-xs-plus px-md py-sm">
            <span aria-hidden className="absolute inset-x-md top-0 h-px bg-border" />
            {radio != null && <div className="flex flex-col">{radio}</div>}
            {selects != null && <div className="grid grid-cols-2 gap-xs">{selects}</div>}
            {filters != null && <div className="flex flex-col">{filters}</div>}
            <div className="flex items-center justify-between gap-sm">
              {countLine}
              {reset}
            </div>
          </div>
        ) : (
          <div className="relative px-lg py-md">
            <span aria-hidden className="absolute inset-x-lg top-0 h-px bg-border" />
            <div className="flex items-end justify-between gap-lg">
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
                {filters}
              </div>
              <div className="flex flex-col items-end gap-2xs">
                {reset != null && <div className="flex">{reset}</div>}
                {countLine}
              </div>
            </div>
          </div>
        ))}
    </section>
  )
}
