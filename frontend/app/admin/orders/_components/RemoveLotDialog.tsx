'use client'

import * as React from 'react'
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@dorado/components'
import type { LotUnlinkBody } from '@dorado/contracts'

import { MIN_REASON } from '../[id]/_components/OverrideReasonBody'

export type RemoveLotDialogProps = {
  open: boolean
  onConfirm: (body: LotUnlinkBody) => void
  onCancel: () => void
  pending?: boolean
  askReason?: boolean
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
  askReason = false,
  layout = 'desktop',
  title = 'Remove from this order?',
  body = 'The lot is kept.',
  confirmLabel = 'Remove',
  cancelLabel = 'Cancel',
}: RemoveLotDialogProps) {
  const mobile = layout === 'mobile'
  const [reason, setReason] = React.useState('')
  const trimmed = reason.trim()
  const missing = askReason && trimmed.length < MIN_REASON
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent size="sm" data-layout={layout} className={mobile ? 'max-w-none' : undefined}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        {askReason && (
          <Input
            label="Reason"
            placeholder="Why is this lot leaving the order?"
            message="Required · at least 10 characters"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            intent="danger"
            disabled={pending || missing}
            onClick={() => onConfirm({ reason: trimmed })}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
