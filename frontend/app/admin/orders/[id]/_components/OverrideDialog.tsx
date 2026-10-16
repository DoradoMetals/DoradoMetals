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

import { MIN_REASON, OverrideReasonBody } from './OverrideReasonBody'

export type OverrideDialogProps = {
  open: boolean
  title: React.ReactNode
  body: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  layout?: 'desktop' | 'mobile'
  stepUp?: boolean
  pending?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
  children?: React.ReactNode
}

export function OverrideDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  layout = 'desktop',
  stepUp = true,
  pending = false,
  onConfirm,
  onCancel,
  children,
}: OverrideDialogProps) {
  const mobile = layout === 'mobile'
  const [reason, setReason] = React.useState('')
  const ready = reason.trim().length >= MIN_REASON

  React.useEffect(() => {
    if (!open) setReason('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        size={mobile ? 'sm' : 'md'}
        data-layout={layout}
        className={mobile ? 'max-w-none' : 'max-w-[35rem]'}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        {children}
        <OverrideReasonBody reason={reason} onReasonChange={setReason} stepUp={stepUp} />
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            intent="danger"
            disabled={!ready || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
