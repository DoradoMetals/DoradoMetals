'use client'

import * as React from 'react'
import { Documents, DOCUMENT_NAMES, type DocumentName, type DocumentRow } from '@dorado/components'

import { formatStamp } from '@/shared/utils/formatStamp'

import { fetchDocument, useDocuments, useImportDocument, useSendDocument } from '../_api'
import { saveBlob } from '../_lib'

const known = (name: string): name is DocumentName =>
  (DOCUMENT_NAMES as readonly string[]).includes(name)

export function OrderDocuments({ orderId }: { orderId: string }) {
  const documents = useDocuments(orderId)
  const send = useSendDocument(orderId)
  const upload = useImportDocument(orderId)
  const picker = React.useRef<HTMLInputElement>(null)
  const importing = React.useRef<string | null>(null)

  const rows: DocumentRow[] = (documents.data ?? [])
    .filter((doc) => known(doc.name))
    .map((doc) => ({
      id: doc.kind,
      name: doc.name as DocumentName,
      state: doc.available ? 'available' : 'unavailable',
      format: 'PDF',
      bytes: doc.size_bytes ?? undefined,
      date: doc.created_at ? formatStamp(doc.created_at) : undefined,
      showSend: true,
      showImport: !doc.available,
      onDownload: () =>
        fetchDocument(orderId, doc.kind).then((blob) => saveBlob(blob, `${doc.name}.pdf`)),
      onSend: () => send.mutate(doc.kind),
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
          if (file && kind) upload.mutate({ kind, file })
          event.target.value = ''
        }}
      />
    </>
  )
}
