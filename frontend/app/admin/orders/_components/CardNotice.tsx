'use client'

import * as React from 'react'
import { Alert, Button } from '@dorado/components'

export type CardNoticeKind = 'stale' | 'error'

export type CardNoticeProps = {
  kind: CardNoticeKind
  message?: string
  onReload?: () => void
  onRetry?: () => void
  layout?: 'desktop' | 'mobile'
}

const COPY = {
  stale: {
    title: 'This order changed since you opened it.',
    body: 'Someone else saved a change. Reload to see it before you edit.',
    action: 'Reload',
  },
  error: {
    title: 'Couldn’t save your change.',
    body: 'Check your connection, then try again.',
    action: 'Try again',
  },
} as const

export function CardNotice({
  kind,
  message,
  onReload,
  onRetry,
  layout = 'desktop',
}: CardNoticeProps) {
  const copy = COPY[kind]
  const onClick = kind === 'stale' ? onReload : onRetry
  return (
    <div
      data-testid="card-notice"
      data-kind={kind}
      data-layout={layout}
      className="flex flex-col items-start gap-sm"
    >
      <Alert intent={kind === 'stale' ? 'warning' : 'danger'} title={copy.title} className="w-full">
        {kind === 'error' && message ? message : copy.body}
      </Alert>
      <Button variant="secondary" size="sm" onClick={onClick}>
        {copy.action}
      </Button>
    </div>
  )
}
