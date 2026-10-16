'use client'

import * as React from 'react'
import { File as FileIcon, UploadCloud } from '@dorado/icons'
import { cn } from '../cn'
import { linkVariants } from '../link/Link'
import { ScrollArea } from '../scroll-area/ScrollArea'

export type UploadError = {
  reason: 'size' | 'type'
  title: React.ReactNode
  remedy: React.ReactNode
}

export type UploadProps = {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  prompt?: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  attachments?: React.ReactNode
  maxFiles?: number
  fileCount?: number
  error?: UploadError | null
  onClearAll?: () => void
  className?: string
}

function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true
  const rules = accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

export function Upload({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  prompt = 'Drag files here or',
  hint,
  icon,
  attachments,
  maxFiles,
  fileCount,
  error = null,
  onClearAll,
  className,
}: UploadProps) {
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const count = fileCount ?? React.Children.count(attachments)
  const isFull = maxFiles != null && count >= maxFiles
  const isBlocked = disabled || isFull
  const hasError = error != null

  const take = (list: FileList | null) => {
    if (!list) return
    const files = Array.from(list).filter((f) => matchesAccept(f, accept))
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col rounded-xl border bg-card transition-colors',
        hasError
          ? 'border-destructive'
          : dragOver
            ? 'border-(length:--stroke-emphasis) border-primary'
            : 'border-border hover:border-border-strong',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <div className="w-full p-sm">
        <label
          data-drag-over={dragOver || undefined}
          className={cn(
            'flex min-h-42 w-full cursor-pointer flex-col items-center justify-center gap-xs rounded-lg border border-dashed text-center transition-colors',
            hasError
              ? 'border-destructive'
              : dragOver
                ? 'border-(length:--stroke-emphasis) border-primary bg-accent'
                : isFull
                  ? 'border-border'
                  : 'border-border-strong hover:border-subtle',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background',
            isBlocked && 'pointer-events-none'
          )}
          onDragOver={(e) => {
            e.preventDefault()
            if (!isBlocked) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!isBlocked) take(e.dataTransfer.files)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={isBlocked}
            className="sr-only"
            onChange={(e) => {
              take(e.currentTarget.files)
              e.currentTarget.value = ''
            }}
          />
          <span
            className={cn(
              '[&_svg]:size-6.5',
              hasError ? 'text-destructive' : isFull ? 'text-placeholder' : 'text-foreground'
            )}
          >
            {icon ?? <UploadCloud aria-hidden />}
          </span>
          {dragOver ? (
            <span className="text-small font-medium text-foreground">Drop here!</span>
          ) : (
            <span
              className={cn(
                'text-small font-medium',
                hasError ? 'text-destructive' : isFull ? 'text-placeholder' : 'text-foreground'
              )}
            >
              {hasError ? (
                error.title
              ) : isFull ? (
                'Maximum files reached'
              ) : (
                <>
                  {prompt} <span className={linkVariants()}>browse</span>
                </>
              )}
            </span>
          )}
          {!dragOver && hasError && (
            <span className="text-micro text-destructive">{error.remedy}</span>
          )}
          {!dragOver && !hasError && hint != null && (
            <span className="text-micro text-placeholder">{hint}</span>
          )}
        </label>
      </div>
      <div className="h-px w-full bg-border" />
      <div className="h-28 w-full shrink-0">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2xs text-placeholder">
            <FileIcon aria-hidden className="size-5" />
            <span className="text-small">No files added yet</span>
          </div>
        ) : (
          <ScrollArea className="h-full" chrome={false}>
            <div className="flex flex-col divide-y divide-border px-sm py-xs-plus">
              {attachments}
            </div>
          </ScrollArea>
        )}
      </div>
      <div className="h-px w-full bg-border" />
      <div className="flex h-9.25 w-full shrink-0 items-center justify-between px-sm">
        <span className={cn('text-micro', isFull ? 'text-foreground' : 'text-placeholder')}>
          {maxFiles != null ? `${count} of ${maxFiles}` : `${count} file${count === 1 ? '' : 's'}`}
        </span>
        {onClearAll != null && (
          <button type="button" onClick={onClearAll} className={linkVariants()}>
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
