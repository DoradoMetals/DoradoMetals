'use client'

import * as React from 'react'
import type { Action } from '@dorado/contracts'

import { ActionConfirmDialog } from './ActionConfirmDialog'
import { OverrideDialog } from './OverrideDialog'
import { StepUpDialog } from './StepUpDialog'

export type ActionCopy = {
  title: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  intent?: 'neutral' | 'danger'
}

export type ActionRun = { action: Action; reason: string | null }

export type StepUpGate = {
  needed: boolean
  destination: React.ReactNode
  onVerify: (code: string) => Promise<unknown> | void
  onPasskey?: () => void
  invalid?: boolean
  pending?: boolean
}

export type UseActionFlowOptions = {
  copy: (action: Action) => ActionCopy
  onRun: (run: ActionRun) => void
  layout?: 'desktop' | 'mobile'
  stepUp?: StepUpGate
  pending?: boolean
  extra?: (action: Action) => React.ReactNode
}

type Step =
  | { kind: 'idle' }
  | { kind: 'confirm'; action: Action }
  | { kind: 'override'; action: Action }
  | { kind: 'step-up'; action: Action; reason: string }

export function useActionFlow({
  copy,
  onRun,
  layout = 'desktop',
  stepUp,
  pending = false,
  extra,
}: UseActionFlowOptions) {
  const [step, setStep] = React.useState<Step>({ kind: 'idle' })
  const close = () => setStep({ kind: 'idle' })

  const finish = (action: Action, reason: string | null) => {
    close()
    onRun({ action, reason })
  }

  const request = (action: Action) => {
    if (action.override) setStep({ kind: 'override', action })
    else if (action.confirm) setStep({ kind: 'confirm', action })
    else onRun({ action, reason: null })
  }

  const afterReason = (action: Action, reason: string) => {
    if (stepUp?.needed) setStep({ kind: 'step-up', action, reason })
    else finish(action, reason)
  }

  const verify = (action: Action, reason: string, code: string) => {
    const result = stepUp?.onVerify(code)
    if (result instanceof Promise) result.then(() => finish(action, reason))
    else finish(action, reason)
  }

  const current = step.kind === 'idle' ? null : step.action
  const words = current ? copy(current) : null

  const dialogs = (
    <>
      <ActionConfirmDialog
        open={step.kind === 'confirm'}
        layout={layout}
        title={words?.title}
        body={step.kind === 'confirm' ? step.action.confirm : null}
        confirmLabel={words?.confirmLabel ?? 'Confirm'}
        cancelLabel={words?.cancelLabel}
        intent={words?.intent}
        pending={pending}
        onConfirm={() => step.kind === 'confirm' && finish(step.action, null)}
        onCancel={close}
      />
      <OverrideDialog
        open={step.kind === 'override'}
        layout={layout}
        title={words?.title}
        body={step.kind === 'override' ? step.action.override : null}
        confirmLabel={words?.confirmLabel ?? 'Confirm'}
        cancelLabel={words?.cancelLabel}
        stepUp={stepUp?.needed ?? false}
        pending={pending}
        onConfirm={(reason) => step.kind === 'override' && afterReason(step.action, reason)}
        onCancel={close}
      >
        {step.kind === 'override' ? extra?.(step.action) : null}
      </OverrideDialog>
      {stepUp && (
        <StepUpDialog
          open={step.kind === 'step-up'}
          layout={layout}
          destination={stepUp.destination}
          invalid={stepUp.invalid}
          pending={stepUp.pending}
          onPasskey={stepUp.onPasskey}
          onVerify={(code) => step.kind === 'step-up' && verify(step.action, step.reason, code)}
          onCancel={close}
        />
      )}
    </>
  )

  return { request, dialogs, step: step.kind }
}
