'use client'

import * as React from 'react'
import { Documents, type DocumentName, type DocumentRow } from '@dorado/components'

import { formatStamp } from '@/shared/utils/formatStamp'

import { saveBlob } from '../../_lib'
import { fetchRefinerDocument, useImportDocument, useRefinerDocuments } from '../_api'

export type RefinerDocumentsProps = {
  orderId: string
  onImported?: (kind: string) => void
  onError?: (error: unknown) => void
}

export function RefinerDocuments({ orderId, onImported, onError }: RefinerDocumentsProps) {
  const documents = useRefinerDocuments(orderId)
  const upload = useImportDocument(orderId)
  const picker = React.useRef<HTMLInputElement>(null)
  const importing = React.useRef<string | null>(null)

  const rows: DocumentRow[] = (documents.data ?? []).map((doc) => ({
    id: doc.kind,
    name: doc.name as DocumentName,
    state: doc.available ? 'available' : 'unavailable',
    meta: doc.available ? undefined : 'Awaiting refiner · Import',
    format: 'PDF',
    bytes: doc.size_bytes ?? undefined,
    date: doc.created_at ? formatStamp(doc.created_at) : undefined,
    showSend: false,
    showImport: !doc.available,
    onDownload: () =>
      fetchRefinerDocument(orderId, doc.kind).then((blob) => saveBlob(blob, `${doc.name}.pdf`)),
    onImport: () => {
      importing.current = doc.kind
      picker.current?.click()
    },
  }))

  return (
    <>
      <Documents
        documents={rows}
        status={documents.isError ? 'error' : documents.isPending ? 'loading' : 'ready'}
        onRetry={() => documents.refetch()}
      />
      <input
        ref={picker}
        type="file"
        accept="application/pdf"
        aria-label="Import document"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const kind = importing.current
          if (file && kind) {
            upload.mutate({ kind, file }, { onSuccess: () => onImported?.(kind), onError })
          }
          event.target.value = ''
        }}
      />
    </>
  )
}
