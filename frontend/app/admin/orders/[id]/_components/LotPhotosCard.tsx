'use client'

import * as React from 'react'
import { Text } from '@dorado/components'
import type { OrderLotView } from '@dorado/contracts'

import { OrderPhotos } from '../../_components/OrderPhotos'
import { useLotPictures } from '../_api'
import { LotPhotos } from './LotPhotos'
import { OrderSection } from './OrderSection'

export type LotPhotosCardProps = {
  lots: readonly OrderLotView[]
  layout?: 'desktop' | 'mobile'
  defaultOpen?: boolean
}

function LotPhotoRow({ lot, onOpen }: { lot: OrderLotView; onOpen: () => void }) {
  const images = useLotPictures(lot.lot_id).data ?? []
  return (
    <div data-lot={lot.lot_id} className="flex items-center justify-between gap-md">
      <span className="flex min-w-0 flex-col gap-3xs">
        <Text variant="small-medium">{lot.name}</Text>
        {lot.lot.reference != null && (
          <Text variant="micro" className="text-muted-foreground">
            {lot.lot.reference}
          </Text>
        )}
      </span>
      <LotPhotos
        label={lot.name}
        photos={images.map((image) => ({ url: image.url }))}
        onOpen={onOpen}
      />
    </div>
  )
}

export function LotPhotosCard({
  lots,
  layout = 'desktop',
  defaultOpen = true,
}: LotPhotosCardProps) {
  const [viewing, setViewing] = React.useState<OrderLotView | null>(null)
  return (
    <>
      <OrderSection
        title="Lot photos"
        layout={layout}
        content={lots.length === 0 ? 'empty' : 'loaded'}
        emptyTitle="No lots yet"
        emptyDescription="Photos show here once the order has lots."
        defaultOpen={defaultOpen}
      >
        {lots.map((lot) => (
          <LotPhotoRow key={lot.id} lot={lot} onOpen={() => setViewing(lot)} />
        ))}
      </OrderSection>
      {viewing && (
        <OrderPhotos lotId={viewing.lot_id} title={viewing.name} onClose={() => setViewing(null)} />
      )}
    </>
  )
}
