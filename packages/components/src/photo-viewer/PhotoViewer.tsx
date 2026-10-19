'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { ChevronLeft, ChevronRight, ImageIcon, X } from '@dorado/icons'
import { Button } from '../button/Button'
import { Thumbnail } from '../thumbnail/Thumbnail'
import { cn } from '../cn'

const viewerVariants = cva(
  'flex w-full flex-col gap-md rounded-lg border border-border bg-highest p-md',
  {
    variants: {
      layout: {
        desktop: 'max-w-[60rem]',
        mobile: 'max-w-80',
      },
    },
    defaultVariants: { layout: 'desktop' },
  }
)

const photoVariants = cva(
  'flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-background',
  {
    variants: {
      layout: {
        desktop: 'h-[28.75rem]',
        mobile: 'h-[15rem]',
      },
    },
    defaultVariants: { layout: 'desktop' },
  }
)

export type PhotoViewerPhoto = { src?: string; alt?: string }

export type PhotoViewerProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  photos: PhotoViewerPhoto[]
  index: number
  onIndexChange: (index: number) => void
  onClose?: () => void
  count?: React.ReactNode
  meta?: React.ReactNode
  onDownload?: () => void
  onDelete?: () => void
  layout?: 'desktop' | 'mobile'
}

export function PhotoViewer({
  title,
  photos,
  index,
  onIndexChange,
  onClose,
  count,
  meta,
  onDownload,
  onDelete,
  layout = 'desktop',
  className,
  ...props
}: PhotoViewerProps) {
  const current = photos[index]
  const actions = (onDownload || onDelete) && (
    <div className="flex items-center justify-end gap-xs">
      {onDownload && (
        <Button variant="tertiary" onClick={onDownload}>
          Download
        </Button>
      )}
      {onDelete && (
        <Button variant="tertiary" intent="danger" onClick={onDelete}>
          Delete
        </Button>
      )}
    </div>
  )

  return (
    <div
      role="group"
      aria-label="Photo viewer"
      data-layout={layout}
      className={cn(viewerVariants({ layout }), className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && index < photos.length - 1) {
          e.preventDefault()
          onIndexChange(index + 1)
        } else if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault()
          onIndexChange(index - 1)
        } else if (e.key === 'Escape' && onClose) {
          e.preventDefault()
          onClose()
        }
      }}
      {...props}
    >
      <div className="flex items-center gap-xs">
        <h2 className="min-w-0 flex-1 text-h4 text-foreground">{title}</h2>
        {onClose && (
          <Button variant="tertiary" size="iconSm" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-sm">
        <Button
          variant="tertiary"
          size="iconSm"
          aria-label="Previous photo"
          disabled={index <= 0}
          onClick={() => onIndexChange(index - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <div className={photoVariants({ layout })}>
          {current?.src != null ? (
            <img
              src={current.src}
              alt={current.alt || `Photo ${index + 1} of ${photos.length}`}
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon aria-hidden className="size-lg text-muted-foreground" />
          )}
        </div>
        <Button
          variant="tertiary"
          size="iconSm"
          aria-label="Next photo"
          disabled={index >= photos.length - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      {count != null && (
        <p aria-live="polite" className="text-center text-small text-muted-foreground">
          {count}
        </p>
      )}
      <div className="flex items-center justify-center gap-xs">
        {photos.map((photo, i) => (
          <Thumbnail
            key={i}
            size="lg"
            src={photo.src}
            alt={photo.alt}
            aria-label={photo.alt || `Photo ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            className={cn(i === index && 'ring-2 ring-primary')}
            onClick={() => onIndexChange(i)}
          />
        ))}
      </div>
      {(meta != null || actions) && (
        <div
          className={cn(
            layout === 'mobile'
              ? 'flex flex-col gap-sm'
              : 'flex items-center justify-between gap-md'
          )}
        >
          {meta != null && <p className="min-w-0 flex-1 text-small text-subtle">{meta}</p>}
          {actions}
        </div>
      )}
    </div>
  )
}
