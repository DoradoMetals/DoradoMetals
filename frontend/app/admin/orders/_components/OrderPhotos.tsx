'use client'

import * as React from 'react'
import { PhotoViewer, useMediaUp } from '@dorado/components'

import { useLotPhotos } from '../_api'

export type OrderPhotosProps = {
  lotId: string
  title: React.ReactNode
  onClose?: () => void
}

export function OrderPhotos({ lotId, title, onClose }: OrderPhotosProps) {
  const mobile = !useMediaUp('lg')
  const images = useLotPhotos(lotId).data ?? []
  const [index, setIndex] = React.useState(0)
  const current = images[Math.min(index, Math.max(images.length - 1, 0))]

  return (
    <PhotoViewer
      layout={mobile ? 'mobile' : 'desktop'}
      title={title}
      photos={images.map((image, position) => ({
        src: image.url,
        alt: `Photo ${position + 1}`,
      }))}
      index={Math.min(index, Math.max(images.length - 1, 0))}
      onIndexChange={setIndex}
      onClose={onClose}
      count={
        images.length > 0
          ? `${Math.min(index, images.length - 1) + 1} of ${images.length}`
          : undefined
      }
      onDownload={current ? () => window.open(current.url, '_blank', 'noopener') : undefined}
    />
  )
}
