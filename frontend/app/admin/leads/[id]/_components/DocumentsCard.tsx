'use client'

import * as React from 'react'
import { DOCUMENT_NAMES, Documents, type DocumentName, type DocumentRow } from '@dorado/components'
import type { LeadDocumentKind, LeadDocumentView } from '@dorado/contracts'

import { formatShortDate } from '../../_lib'

const NAMES: readonly string[] = DOCUMENT_NAMES

const known = (name: string): name is DocumentName => NAMES.includes(name)

export type DocumentsCardProps = {
  documents: LeadDocumentView[] | undefined
  kinds: LeadDocumentKind[]
  failed: boolean
  onRetry: () => void
  onSend: (pdfId: string) => void
  onDownload: (pdfId: string) => void
}

export function DocumentsCard({
  documents,
  kinds,
  failed,
  onRetry,
  onSend,
  onDownload,
}: DocumentsCardProps) {
  const held = documents ?? []
  const rows: DocumentRow[] = []
  for (const doc of held) {
    if (!known(doc.name)) continue
    rows.push({
      id: doc.pdf_id,
      name: doc.name,
      state: 'available',
      format: 'PDF',
      bytes: doc.size_bytes ?? undefined,
      date: formatShortDate(doc.uploaded_at),
      onSend: () => onSend(doc.pdf_id),
      onDownload: () => onDownload(doc.pdf_id),
    })
  }
  for (const kind of kinds) {
    if (!known(kind.name) || held.some((doc) => doc.kind === kind.kind)) continue
    rows.push({ id: kind.kind, name: kind.name, state: 'unavailable' })
  }

  return (
    <div data-testid="lead-card-documents">
      <Documents
        documents={rows}
        status={failed ? 'error' : documents === undefined ? 'loading' : 'ready'}
        onRetry={onRetry}
      />
    </div>
  )
}
