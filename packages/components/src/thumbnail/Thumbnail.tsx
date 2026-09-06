'use client'

import * as React from 'react'
import { Download, ImageIcon } from '@dorado/icons'
import { cn } from '../cn'

export type ThumbnailSize = 'sm' | 'md'

export type ThumbnailProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  src?: string
  alt?: string
  size?: ThumbnailSize
  showGlyph?: boolean
}

const SIZES: Record<ThumbnailSize, string> = { sm: 'size-8', md: 'size-10' }

export const Thumbnail = React.forwardRef<HTMLButtonElement, ThumbnailProps>(
  ({ src, alt = '', size = 'md', showGlyph = true, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-secondary outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
        SIZES[size],
        className
      )}
      {...props}
    >
      {src != null ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        showGlyph && <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
      )}
      <span
        aria-hidden
        className="absolute inset-0 hidden items-center justify-center bg-card/60 group-hover:flex group-focus-visible:flex"
      >
        <Download className="size-4 text-foreground" />
      </span>
    </button>
  )
)
Thumbnail.displayName = 'Thumbnail'
