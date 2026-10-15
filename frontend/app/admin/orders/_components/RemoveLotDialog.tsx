'use client'

import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@dorado/components'

export type RemoveLotDialogProps = {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
  layout?: 'desktop' | 'mobile'
  title?: React.ReactNode
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
}

export function RemoveLotDialog({
  open,
  onConfirm,
  onCancel,
  pending = false,
  layout = 'desktop',
  title = 'Remove from this order?',
  body = 'The lot is kept.',
  confirmLabel = 'Remove',
  cancelLabel = 'Cancel',
}: RemoveLotDialogProps) {
  const mobile = layout === 'mobile'
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent size="sm" data-layout={layout} className={mobile ? 'max-w-none' : undefined}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : 'gap-xs'}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button intent="danger" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
