import * as React from 'react'
import { Input } from '@dorado/components'

export const MIN_REASON = 10

export type OverrideReasonBodyProps = {
  reason: string
  onReasonChange: (reason: string) => void
  stepUp?: boolean
  invalid?: boolean
}

export function OverrideReasonBody({
  reason,
  onReasonChange,
  stepUp = true,
  invalid = false,
}: OverrideReasonBodyProps) {
  return (
    <div className="flex flex-col gap-sm">
      <Input
        label="Reason"
        placeholder="Why are you overriding this refusal?"
        message="Required · at least 10 characters"
        invalid={invalid}
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
      />
      {stepUp && (
        <p className="text-micro text-subtle">
          You will be asked to re-authenticate before this sends.
        </p>
      )}
    </div>
  )
}
