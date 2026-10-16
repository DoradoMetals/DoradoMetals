'use client'

import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Link,
  OTPInput,
  Textarea,
} from '@dorado/components'
import type { Action } from '@dorado/contracts'

export type RefinerConfirmActionName =
  | 'cancel'
  | 'edit'
  | 'edit_lots'
  | 'send'
  | 'settle'
  | 'send_payment'
  | 'lock_ounces'
  | 'resolve_dispute'

type Copy = {
  title: (reference: string) => string
  body: string
  confirmLabel: string
  cancelLabel: string
  intent: 'neutral' | 'danger'
}

export const refinerConfirmCopy: Record<RefinerConfirmActionName, Copy> = {
  cancel: {
    title: (reference) => `Cancel ${reference}?`,
    body: 'Its lots are released and go back on hand. This cannot be undone.',
    confirmLabel: 'Cancel order',
    cancelLabel: 'Keep order',
    intent: 'danger',
  },
  edit: {
    title: (reference) => `Change the refiner on ${reference}?`,
    body: 'The refiner and the location on this order change.',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  edit_lots: {
    title: (reference) => `Change the lots on ${reference}?`,
    body: 'The refiner works from the lots you send.',
    confirmLabel: 'Change lots',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  send: {
    title: (reference) => `Send ${reference}?`,
    body: 'The lots go to the refiner as they stand now.',
    confirmLabel: 'Send',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  settle: {
    title: (reference) => `Settle ${reference}?`,
    body: 'Every lot is marked settled at the refiner’s figures.',
    confirmLabel: 'Settle',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  send_payment: {
    title: (reference) => `Send payment for ${reference}?`,
    body: 'Payouts cannot be recalled once sent.',
    confirmLabel: 'Send payment',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  lock_ounces: {
    title: (reference) => `Lock ounces on ${reference}?`,
    body: 'The locked ounces come out of the pool.',
    confirmLabel: 'Lock ounces',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
  resolve_dispute: {
    title: (reference) => `Resolve the dispute on ${reference}?`,
    body: 'The assay dispute is closed and the order goes back to settlement.',
    confirmLabel: 'Resolve dispute',
    cancelLabel: 'Cancel',
    intent: 'neutral',
  },
}

export type RefinerConfirmStepUp = {
  destination: string
  onVerify: (code: string) => void
  onPasskey?: () => void
}

export type RefinerConfirmProps = {
  open: boolean
  action: Action & { name: RefinerConfirmActionName }
  reference: string
  body?: string
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  stepUp?: RefinerConfirmStepUp
  onConfirm: (body: { override_reason?: string }) => void
  onCancel: () => void
}

const sentence = (text: string): string =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`

export function RefinerConfirm({
  open,
  action,
  reference,
  body,
  layout = 'desktop',
  pending = false,
  stepUp,
  onConfirm,
  onCancel,
}: RefinerConfirmProps) {
  const mobile = layout === 'mobile'
  const copy = refinerConfirmCopy[action.name]
  const override = action.override !== null
  const [reason, setReason] = React.useState('')
  const [code, setCode] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setReason('')
      setCode('')
    }
  }, [open])

  const said = action.override ?? action.confirm
  const kind = stepUp ? 'step-up' : 'confirm'
  const blocked = pending || (kind === 'confirm' && override && reason.trim().length === 0)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        size={mobile ? 'sm' : 'md'}
        data-layout={layout}
        data-kind={kind}
        data-intent={copy.intent}
        className={mobile ? 'max-w-none' : undefined}
      >
        {stepUp ? (
          <>
            <DialogTitle>Confirm it’s you</DialogTitle>
            <DialogDescription>This action needs a fresh sign-in.</DialogDescription>
            <div className="flex flex-col gap-md">
              <p className="text-small text-muted-foreground">
                Enter the 6-digit code we sent to {stepUp.destination}.
              </p>
              <OTPInput length={6} label="Code" value={code} onValueChange={setCode} autoFocus />
              {stepUp.onPasskey ? (
                <Link
                  href="#"
                  intent="neutral"
                  className="self-start"
                  onClick={(event) => {
                    event.preventDefault()
                    stepUp.onPasskey?.()
                  }}
                >
                  Use a passkey instead
                </Link>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <DialogTitle>{copy.title(reference)}</DialogTitle>
            <DialogDescription>
              {said ? `${sentence(said)} ` : ''}
              {body ?? copy.body}
            </DialogDescription>
            {override ? (
              <Textarea
                label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
              />
            ) : null}
          </>
        )}
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            {stepUp ? 'Cancel' : copy.cancelLabel}
          </Button>
          <Button
            variant="primary"
            intent={stepUp ? 'neutral' : copy.intent}
            disabled={blocked || (kind === 'step-up' && code.length < 6)}
            onClick={() =>
              stepUp
                ? stepUp.onVerify(code)
                : onConfirm(override ? { override_reason: reason.trim() } : {})
            }
          >
            {stepUp ? 'Verify' : copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
