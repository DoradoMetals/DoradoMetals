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

export type ActionConfirmDialogProps = {
  open: boolean
  title: React.ReactNode
  body: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  intent?: 'neutral' | 'danger'
  layout?: 'desktop' | 'mobile'
  size?: 'sm' | 'md' | 'lg'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ActionConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  intent = 'neutral',
  layout = 'desktop',
  size = 'md',
  pending = false,
  onConfirm,
  onCancel,
}: ActionConfirmDialogProps) {
  const mobile = layout === 'mobile'
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        size={mobile ? 'sm' : size}
        data-layout={layout}
        data-intent={intent}
        className={mobile ? 'max-w-none' : undefined}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button intent={intent} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
