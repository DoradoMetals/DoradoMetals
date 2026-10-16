'use client'

import * as React from 'react'
import { Spinner, Text, Thumbnail } from '@dorado/components'

export type LotPhoto = { url: string; alt?: string }

export type LotPhotosProps = {
  photos: readonly LotPhoto[]
  label: string
  onOpen?: (index: number) => void
  max?: number
  uploading?: number
}

export function LotPhotos({ photos, label, onOpen, max = 3, uploading = 0 }: LotPhotosProps) {
  const pending = uploading > 0 && (
    <>
      {Array.from({ length: uploading }, (_, index) => (
        <Thumbnail
          key={`uploading-${index}`}
          aria-label={`Uploading photo of ${label}`}
          disabled
          showGlyph={false}
          className="opacity-50"
        />
      ))}
      <Spinner size="sm" label="Uploading" />
      <Text variant="micro" className="text-muted-foreground">
        {`${uploading} uploading`}
      </Text>
    </>
  )
  if (photos.length === 0 && !pending) {
    return (
      <span data-count="none" className="flex items-center gap-xs">
        <Thumbnail aria-label={`No photos of ${label}`} disabled />
      </span>
    )
  }
  if (photos.length === 0) {
    return (
      <span data-count="uploading" className="flex items-center gap-xs">
        {pending}
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
      {pending}
    </span>
  )
}
