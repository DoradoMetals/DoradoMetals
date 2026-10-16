'use client'

import * as React from 'react'
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader } from '@dorado/components'
import type { AdoptAssayCandidate, OrderLotPatch } from '@dorado/contracts'

import { AdoptAssayBody } from './AdoptAssayBody'

export type AdoptAssayDrawerProps = {
  open: boolean
  candidates: readonly AdoptAssayCandidate[]
  confirm?: React.ReactNode
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onFiguresChange?: (id: string, figures: OrderLotPatch) => void
  lineHref?: (lineReference: string) => string
  onConfirm: () => void
  onCancel: () => void
}

export function AdoptAssayDrawer({
  open,
  candidates,
  confirm,
  layout = 'desktop',
  pending = false,
  onFiguresChange,
  lineHref,
  onConfirm,
  onCancel,
}: AdoptAssayDrawerProps) {
  const mobile = layout === 'mobile'
  return (
    <Drawer
      open={open}
      setOpen={(next) => !next && onCancel()}
      size={mobile ? 'full' : 'lg'}
      label="Adopt refiner assay"
    >
      <div data-layout={layout} className="contents">
        <DrawerHeader title="Adopt refiner assay" />
        <DrawerBody className="gap-md">
          {confirm}
          <AdoptAssayBody
            candidates={candidates}
            layout={layout}
            onFiguresChange={onFiguresChange}
            lineHref={lineHref}
          />
        </DrawerBody>
        <DrawerFooter className={mobile ? 'sm:flex-col-reverse sm:items-stretch' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            Adopt
          </Button>
        </DrawerFooter>
      </div>
    </Drawer>
  )
}
