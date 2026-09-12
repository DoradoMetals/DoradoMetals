'use client'

import * as React from 'react'
import { Documents, type DocumentName, type DocumentRow } from '@dorado/components'
import type { OrderDocument } from '@dorado/contracts'

export type DocumentsCardProps = {
  documents: OrderDocument[]
  onDownload?: (kind: string) => void
  onSend?: (kind: string) => void
  onImport?: (kind: string, file: File) => void
}

export function DocumentsCard({ documents, onDownload, onSend, onImport }: DocumentsCardProps) {
  const input = React.useRef<HTMLInputElement>(null)
  const [kind, setKind] = React.useState<string | null>(null)

  const rows: DocumentRow[] = documents.map((document) => ({
    id: document.kind,
    name: document.name as DocumentName,
    state: document.available ? 'available' : 'unavailable',
    showSend: document.available && !!onSend,
    showImport: !document.available && !!onImport,
    onDownload: document.available && onDownload ? () => onDownload(document.kind) : undefined,
    onSend: document.available && onSend ? () => onSend(document.kind) : undefined,
    onImport:
      !document.available && onImport
        ? () => {
            setKind(document.kind)
            input.current?.click()
          }
        : undefined,
  }))

  return (
    <>
      <Documents documents={rows} defaultOpen />
      {onImport && (
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          hidden
          data-testid="document-import"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file && kind) onImport(kind, file)
            event.target.value = ''
            setKind(null)
          }}
        />
      )}
    </>
  )
}
