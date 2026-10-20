'use client'

import * as React from 'react'
import { ConfirmDialog } from '@dorado/components'

export type DeleteLeadDialogProps = {
  open: boolean
  count?: number
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteLeadDialog({
  open,
  count = 1,
  pending = false,
  onConfirm,
  onCancel,
}: DeleteLeadDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={count === 1 ? 'Delete this lead?' : `Delete ${count} leads?`}
      body="It moves to the archive and can be restored."
      confirmLabel="Delete"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
