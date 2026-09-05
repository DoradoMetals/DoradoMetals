'use client'

import * as React from 'react'

import { cn } from '../cn'

export type FooterColumn = {
  heading: string
  links: React.ReactNode[]
}

export type FooterProps = {
  brand: React.ReactNode
  tagline?: React.ReactNode
  cta?: React.ReactNode
  columns: FooterColumn[]
  legal: React.ReactNode
  legalLinks?: React.ReactNode[]
  legalHeading?: string
  social?: React.ReactNode
  notice?: React.ReactNode
  className?: string
}

export function Footer({
  brand,
  tagline,
  cta,
  columns,
  legal,
  legalLinks,
  legalHeading = 'Legal',
  social,
  notice,
  className,
}: FooterProps) {
  return (
    <footer
      className={cn(
        'flex w-full flex-col items-center gap-3 border-t border-border bg-background px-6 pt-8 pb-6',
        'lg:items-stretch lg:gap-12 lg:px-16 lg:pt-12 lg:pb-8',
        className
      )}
    >
      <div className="flex w-full flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-0">
        <div className="flex flex-col items-center gap-4 lg:w-[500px] lg:items-start">
          {brand}
          {tagline != null && <small data-emphasis="subtlest">{tagline}</small>}
          {cta}
        </div>

        <div className="flex w-full flex-wrap justify-center gap-6 py-4 lg:w-auto lg:flex-1 lg:flex-nowrap lg:justify-between lg:gap-0 lg:py-0">
          {columns.map((column) => (
            <div key={column.heading} className="flex w-[150px] flex-col gap-3 lg:w-auto">
              <h6 data-emphasis="subtlest">{column.heading}</h6>
              {column.links.map((link, index) => (
                <React.Fragment key={index}>{link}</React.Fragment>
              ))}
            </div>
          ))}
          {legalLinks && legalLinks.length > 0 && (
            <div className="flex w-[150px] flex-col gap-3 lg:hidden">
              <h6 data-emphasis="subtlest">{legalHeading}</h6>
              {legalLinks.map((link, index) => (
                <React.Fragment key={index}>{link}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full items-center justify-between">
        <small>{legal}</small>

        {legalLinks && legalLinks.length > 0 && (
          <div className="hidden items-center gap-4 lg:flex">
            {legalLinks.map((link, index) => (
              <React.Fragment key={index}>{link}</React.Fragment>
            ))}
          </div>
        )}

        {social && <div className="flex items-center gap-3 lg:hidden">{social}</div>}
      </div>

      {notice != null && (
        <small data-emphasis="subtlest" className="w-full">
          {notice}
        </small>
      )}
    </footer>
  )
}
