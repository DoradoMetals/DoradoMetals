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
} from '@dorado/components'

export const STEP_UP_LENGTH = 6

export type StepUpDialogProps = {
  open: boolean
  destination: React.ReactNode
  layout?: 'desktop' | 'mobile'
  invalid?: boolean
  pending?: boolean
  onVerify: (code: string) => void
  onPasskey?: () => void
  onCancel: () => void
}

export function StepUpDialog({
  open,
  destination,
  layout = 'desktop',
  invalid = false,
  pending = false,
  onVerify,
  onPasskey,
  onCancel,
}: StepUpDialogProps) {
  const mobile = layout === 'mobile'
  const [code, setCode] = React.useState('')

  React.useEffect(() => {
    if (!open) setCode('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        size={mobile ? 'sm' : 'md'}
        data-layout={layout}
        className={mobile ? 'max-w-none' : undefined}
      >
        <DialogTitle>Confirm it’s you</DialogTitle>
        <DialogDescription>This action needs a fresh sign-in.</DialogDescription>
        <div className="flex flex-col gap-md">
          <p className="text-small text-muted-foreground">
            Enter the {STEP_UP_LENGTH}-digit code we sent to {destination}.
          </p>
          <OTPInput
            length={STEP_UP_LENGTH}
            value={code}
            onValueChange={setCode}
            invalid={invalid}
            disabled={pending}
          />
          {onPasskey && (
            <Link asChild className="self-start">
              <button type="button" onClick={onPasskey}>
                Use a passkey instead
              </button>
            </Link>
          )}
        </div>
        <DialogFooter stacked={mobile} className={mobile ? '[&>button]:w-full' : undefined}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={code.length !== STEP_UP_LENGTH || pending}
            onClick={() => onVerify(code)}
          >
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
