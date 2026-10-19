'use client'

import * as React from 'react'
import { Download, ImageIcon } from '@dorado/icons'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

export type ThumbnailSize = 'sm' | 'md' | 'lg' | 'xl'

export type ThumbnailProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  src?: string
  alt?: string
  size?: ThumbnailSize
  showGlyph?: boolean
  overflow?: number
}

const thumbnailVariants = cva('', {
  variants: {
    size: { sm: 'size-xl', md: 'size-10', lg: 'size-3xl', xl: 'size-4xl' },
  },
})

const glyphVariants = cva('', {
  variants: {
    size: { sm: 'size-md', md: 'size-md', lg: 'size-lg', xl: 'size-xl' },
  },
})

export const Thumbnail = React.forwardRef<HTMLButtonElement, ThumbnailProps>(
  ({ src, alt = '', size = 'md', showGlyph = true, overflow, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={overflow == null && !alt ? 'Image' : undefined}
      className={cn(
        'group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-secondary outline-none',
        'focus-ring',
        thumbnailVariants({ size }),
        className
      )}
      {...props}
    >
      {overflow != null ? (
        <span className="micro font-medium text-foreground">{`+${overflow}`}</span>
      ) : src != null ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        showGlyph && (
          <ImageIcon aria-hidden className={cn(glyphVariants({ size }), 'text-muted-foreground')} />
        )
      )}
      <span
        aria-hidden
        className="absolute inset-0 hidden items-center justify-center bg-card/60 group-hover:flex group-focus-visible:flex"
      >
        <Download className={cn(glyphVariants({ size }), 'text-foreground')} />
      </span>
    </button>
  )
)
Thumbnail.displayName = 'Thumbnail'
