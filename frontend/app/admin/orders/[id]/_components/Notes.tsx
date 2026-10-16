'use client'

import * as React from 'react'
import { Button, Text, Textarea } from '@dorado/components'
import type { NoteView, UserName as UserNameRow } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'
import { userNameOf } from '@/shared/ui/UserName'

import { OrderSection, type SectionContent } from './OrderSection'

export type NotesProps = {
  notes: readonly NoteView[] | undefined
  names: readonly UserNameRow[] | undefined
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onAdd?: (body: string) => void
  onRetry?: () => void
  defaultOpen?: boolean
}

export function Notes({
  notes,
  names,
  content = 'loaded',
  layout = 'desktop',
  pending = false,
  onAdd,
  onRetry,
  defaultOpen = true,
}: NotesProps) {
  const [draft, setDraft] = React.useState('')
  const canAdd = onAdd != null

  return (
    <OrderSection
      title="Notes"
      layout={layout}
      content={content}
      errorTitle="Couldn’t load notes"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      {(notes ?? []).map((note) => (
        <article key={note.id} className="flex flex-col gap-3xs">
          <span className="flex items-baseline gap-2xs-plus">
            <Text variant="small-medium">{userNameOf(names, note.author_id)}</Text>
            <Text variant="micro" className="text-muted-foreground">
              {`· ${formatStamp(note.created_at)}`}
            </Text>
          </span>
          <Text variant="small">{note.body}</Text>
        </article>
      ))}
      <div className="flex flex-col items-start gap-sm">
        <Textarea
          aria-label="Note"
          className="w-full"
          rows={5}
          placeholder="Add a note for the team…"
          value={draft}
          disabled={!canAdd}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!canAdd || pending || draft.trim() === ''}
          onClick={() => {
            onAdd?.(draft.trim())
            setDraft('')
          }}
        >
          Add note
        </Button>
      </div>
    </OrderSection>
  )
}
