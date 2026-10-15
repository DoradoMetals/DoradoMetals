'use client'

import * as React from 'react'
import { Download, FilePlus, FileText, Send, Upload } from '@dorado/icons'

import { Accordion } from '../accordion/Accordion'
import { Alert } from '../alert/Alert'
import { Button } from '../button/Button'
import { Divider } from '../divider/Divider'
import { Skeleton } from '../skeleton/Skeleton'
import { cn } from '../cn'

export const DOCUMENT_NAMES = [
  'Invoice',
  'Shipment Manifest',
  'Return Shipment Manifest',
  'Shipping Instructions',
  'Pickup Manifest',
  'Pickup Instructions',
  'Intake Receipt',
  'Appointment Instructions',
  'Assay Results',
  'Rate Sheet',
] as const

export type DocumentName = (typeof DOCUMENT_NAMES)[number]

export type DocumentState = 'available' | 'generating' | 'unavailable'

export type DocumentRow = {
  id: string
  name: DocumentName
  meta?: React.ReactNode
  format?: string
  bytes?: number
  date?: string
  state: DocumentState
  showSend?: boolean
  showImport?: boolean
  showGenerate?: boolean
  onDownload?: () => void
  onSend?: () => void
  onImport?: () => void
  onGenerate?: () => void
}

export type DocumentsStatus = 'ready' | 'loading' | 'error'

export type DocumentsProps = {
  documents: DocumentRow[]
  status?: DocumentsStatus
  onRetry?: () => void
  open?: boolean
  onToggle?: () => void
  defaultOpen?: boolean
  className?: string
}

const NAME_STYLES: Record<DocumentState, string> = {
  available: 'text-foreground',
  generating: 'text-foreground',
  unavailable: 'text-muted-foreground',
}

const META_STYLES: Record<DocumentState, string> = {
  available: 'text-muted-foreground',
  generating: 'text-placeholder',
  unavailable: 'text-foreground-disabled',
}

const ICON_STYLES: Record<DocumentState, string> = {
  available: 'text-muted-foreground',
  generating: 'text-muted-foreground',
  unavailable: 'text-foreground-disabled',
}

const META_FALLBACK: Partial<Record<DocumentState, React.ReactNode>> = {
  generating: 'Generating…',
  unavailable: 'Not yet available',
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatBytes(bytes: number) {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${UNITS[unit]}`
}

function rowMeta(doc: DocumentRow): React.ReactNode {
  if (doc.meta != null) return doc.meta
  if (doc.state !== 'available') return META_FALLBACK[doc.state]
  const parts = [
    doc.format,
    doc.bytes != null ? formatBytes(doc.bytes) : undefined,
    doc.date,
  ].filter((part): part is string => part != null && part !== '')
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function RowAction({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ElementType
  label: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Button
      variant="tertiary"
      size="iconSm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden />
    </Button>
  )
}

function DocumentRowItem({ doc }: { doc: DocumentRow }) {
  const {
    name,
    state,
    showSend = true,
    showImport = false,
    showGenerate = false,
    onDownload,
    onSend,
    onImport,
    onGenerate,
  } = doc
  const metaText = rowMeta(doc)

  return (
    <li className="flex w-full items-center gap-xs px-sm py-xs">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary',
          ICON_STYLES[state]
        )}
      >
        <FileText aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-3xs">
        <span className={cn('truncate text-small font-medium', NAME_STYLES[state])}>{name}</span>
        {metaText != null && (
          <span className={cn('truncate text-micro', META_STYLES[state])}>{metaText}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-md">
        {state === 'available' && showSend && (
          <RowAction icon={Send} label={`Send ${name}`} onClick={onSend} />
        )}
        {state !== 'unavailable' && (
          <RowAction
            icon={Download}
            label={`Download ${name}`}
            disabled={state === 'generating'}
            onClick={onDownload}
          />
        )}
        {state === 'unavailable' && showGenerate && (
          <RowAction icon={FilePlus} label={`Generate ${name}`} onClick={onGenerate} />
        )}
        {state === 'unavailable' && showImport && (
          <RowAction icon={Upload} label={`Import ${name}`} onClick={onImport} />
        )}
      </span>
    </li>
  )
}

function LoadingRows() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading documents"
      className="flex w-full flex-col gap-2xs py-2xs"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex w-full items-center gap-xs px-sm py-xs">
          <Skeleton shape="block" className="size-(--control-sm) shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-xs">
            <Skeleton shape="text" />
            <Skeleton shape="text" className="w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Documents({
  documents,
  status = 'ready',
  onRetry,
  open,
  onToggle,
  defaultOpen = true,
  className,
}: DocumentsProps) {
  const isEmpty = status === 'ready' && documents.length === 0

  return (
    <Accordion
      label="Documents"
      trailing={
        status !== 'ready'
          ? undefined
          : isEmpty
            ? 'None yet'
            : `${documents.length} document${documents.length === 1 ? '' : 's'}`
      }
      chevron="leading"
      open={open}
      onToggle={onToggle}
      defaultOpen={defaultOpen}
      flush
      className={className}
    >
      <Divider />
      {status === 'loading' ? (
        <LoadingRows />
      ) : status === 'error' ? (
        <div className="flex w-full flex-col items-start gap-sm p-md">
          <Alert intent="danger" title="Couldn't load documents" className="w-full">
            Something went wrong loading the documents for this order.
          </Alert>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="flex w-full flex-col items-center gap-xs px-lg py-xl text-center">
          <FileText aria-hidden className="size-8 text-muted-foreground" />
          <span className="text-small font-medium text-muted-foreground">No documents yet</span>
          <span className="text-micro text-placeholder">
            Your invoice and shipment manifest appear here once the order is priced.
          </span>
        </div>
      ) : (
        <ul className="flex w-full flex-col divide-y divide-border py-2xs">
          {documents.map((doc) => (
            <DocumentRowItem key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </Accordion>
  )
}
