import * as React from 'react'

import { ActionConfirmDialog } from './ActionConfirmDialog'

export type AddressChangeDialogProps = {
  open: boolean
  trackingLabel: React.ReactNode
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function AddressChangeDialog({
  open,
  trackingLabel,
  layout = 'desktop',
  pending = false,
  onConfirm,
  onCancel,
}: AddressChangeDialogProps) {
  return (
    <ActionConfirmDialog
      open={open}
      layout={layout}
      pending={pending}
      title="Change the ship-to address?"
      body={
        <>
          Voids the label and relabels. {trackingLabel} stops working and a new label is bought for
          the new address.
        </>
      }
      cancelLabel="Keep address"
      confirmLabel="Change and relabel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
