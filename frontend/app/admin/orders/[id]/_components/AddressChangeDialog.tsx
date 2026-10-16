import * as React from 'react'
import { Input, Text } from '@dorado/components'

import { ActionConfirmDialog } from './ActionConfirmDialog'

export type AddressChangeDialogProps = {
  open: boolean
  trackingLabel: React.ReactNode
  currentAddress?: React.ReactNode
  newAddress?: string
  reason?: string
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

export function AddressChangeDialog({
  open,
  trackingLabel,
  currentAddress,
  newAddress,
  reason,
  layout = 'desktop',
  pending = false,
  onConfirm,
  onCancel,
}: AddressChangeDialogProps) {
  const [written, setWritten] = React.useState(reason ?? '')
  React.useEffect(() => {
    setWritten(reason ?? '')
  }, [reason, open])
  const given = written.trim()
  return (
    <ActionConfirmDialog
      open={open}
      layout={layout}
      pending={pending || given === ''}
      title="Change the ship-to address?"
      body={
        <span className="flex flex-col gap-md">
          <span>
            Voids the label and relabels. {trackingLabel} stops working and a new label is bought
            for the new address.
          </span>
          {currentAddress != null && (
            <span className="flex flex-col gap-3xs">
              <Text variant="small" className="text-muted-foreground">
                Current address
              </Text>
              <Text variant="small" className="text-foreground">
                {currentAddress}
              </Text>
            </span>
          )}
          {newAddress != null && (
            <Input label="New address" value={newAddress} readOnly onChange={() => {}} />
          )}
          <Input
            label="Reason"
            placeholder="Why the address changes"
            value={written}
            onChange={(event) => setWritten(event.target.value)}
          />
        </span>
      }
      cancelLabel="Keep address"
      confirmLabel="Change and relabel"
      onConfirm={() => {
        if (given !== '') onConfirm(given)
      }}
      onCancel={onCancel}
    />
  )
}
