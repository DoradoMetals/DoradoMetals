'use client'

import * as React from 'react'
import { Download, FilePlus, FileText, Send, Trash2, Upload } from '@dorado/icons'

import { Accordion } from '../accordion/Accordion'
import { Button } from '../button/Button'
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
  state: DocumentState
  showSend?: boolean
  showDelete?: boolean
  showImport?: boolean
  showGenerate?: boolean
  onDownload?: () => void
  onSend?: () => void
  onDelete?: () => void
  onImport?: () => void
  onGenerate?: () => void
}

export type DocumentsProps = {
  documents: DocumentRow[]
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

function RowAction({
  icon: Icon,
  label,
  intent,
  disabled,
  onClick,
}: {
  icon: React.ElementType
  label: string
  intent?: 'neutral' | 'danger'
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Button
      variant="tertiary"
      intent={intent}
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
    meta,
    state,
    showSend = true,
    showDelete = true,
    showImport = false,
    showGenerate = false,
    onDownload,
    onSend,
    onDelete,
    onImport,
    onGenerate,
  } = doc
  const metaText = state === 'available' ? meta : META_FALLBACK[state]

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
      <span className="flex shrink-0 items-center gap-3xs">
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
        {state === 'available' && showDelete && (
          <RowAction icon={Trash2} label={`Delete ${name}`} intent="danger" onClick={onDelete} />
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

export function Documents({
  documents,
  open,
  onToggle,
  defaultOpen = true,
  className,
}: DocumentsProps) {
  const isEmpty = documents.length === 0

  return (
    <Accordion
      label="Documents"
      trailing={
        isEmpty ? 'None yet' : `${documents.length} document${documents.length === 1 ? '' : 's'}`
      }
      chevron="leading"
      open={open}
      onToggle={onToggle}
      defaultOpen={defaultOpen}
      className={className}
    >
      {isEmpty ? (
        <div className="flex w-full flex-col items-center gap-xs px-lg py-xl text-center">
          <FileText aria-hidden className="size-8 text-muted-foreground" />
          <span className="text-small font-medium text-muted-foreground">No documents yet</span>
          <span className="text-micro text-placeholder">
            Your invoice and packing list appear here once the order is priced.
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
