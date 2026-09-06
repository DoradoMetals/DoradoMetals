'use client'

import { Documents, DOCUMENT_NAMES, type DocumentName, type DocumentRow } from '@dorado/components'
import type { OrderDocument } from '@dorado/contracts'

export type DocumentsCardProps = {
  documents: OrderDocument[]
  onDownload?: (kind: string) => void
  onSend?: (kind: string) => void
  onImport?: (kind: string) => void
}

const KNOWN = new Set<string>(DOCUMENT_NAMES)

// Which rows exist follows the order's fulfillment category and whether the
// invoice is available follows finalization - both are the API's answer, read
// straight off `GET /orders/:id/documents`.
export function DocumentsCard({ documents, onDownload, onSend, onImport }: DocumentsCardProps) {
  const rows: DocumentRow[] = documents
    .filter((document) => KNOWN.has(document.name))
    .map((document) => ({
      id: document.kind,
      name: document.name as DocumentName,
      state: document.available ? 'available' : 'unavailable',
      showSend: document.available && !!onSend,
      showImport: !document.available && !!onImport,
      onDownload: document.available && onDownload ? () => onDownload(document.kind) : undefined,
      onSend: document.available && onSend ? () => onSend(document.kind) : undefined,
      onImport: !document.available && onImport ? () => onImport(document.kind) : undefined,
    }))

  return <Documents documents={rows} defaultOpen />
}
