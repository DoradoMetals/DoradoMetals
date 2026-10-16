'use client'

import * as React from 'react'
import { Thumbnail } from '@dorado/components'

export type LotPhoto = { url: string; alt?: string }

export type LotPhotosProps = {
  photos: readonly LotPhoto[]
  label: string
  onOpen?: (index: number) => void
  max?: number
}

export function LotPhotos({ photos, label, onOpen, max = 3 }: LotPhotosProps) {
  if (photos.length === 0) {
    return (
      <span data-count="none" className="flex items-center gap-xs">
        <Thumbnail aria-label={`No photos of ${label}`} disabled />
      </span>
    )
  }
  const over = photos.length > max
  const shown = photos.slice(0, max)
  const hidden = photos.length - shown.length
  const count = photos.length === 1 ? 'one' : over ? 'more' : 'several'
  return (
    <span data-count={count} className="flex items-center gap-xs">
      {shown.map((photo, index) => (
        <Thumbnail
          key={`${photo.url}-${index}`}
          src={photo.url}
          alt={photo.alt ?? `${label}, photo ${index + 1}`}
          aria-label={`Open photo ${index + 1} of ${label}`}
          onClick={() => onOpen?.(index)}
        />
      ))}
      {over && (
        <Thumbnail
          overflow={hidden}
          aria-label={`${hidden} more photos of ${label}`}
          onClick={() => onOpen?.(shown.length)}
        />
      )}
    </span>
  )
}
