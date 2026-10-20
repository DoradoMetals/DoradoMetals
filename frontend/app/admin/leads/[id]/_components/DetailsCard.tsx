'use client'

import * as React from 'react'
import { Button, Select, Textarea, type SelectItemShape } from '@dorado/components'
import type { LeadPatch, LeadView } from '@dorado/contracts'

import { LeadSection } from './LeadSection'

const NONE = 'none'

export type DetailsCardProps = {
  lead: LeadView
  sources: SelectItemShape[]
  pending?: boolean
  onSave: (patch: LeadPatch, done: () => void) => void
}

export function DetailsCard({ lead, sources, pending = false, onSave }: DetailsCardProps) {
  const [editing, setEditing] = React.useState(false)
  const [source, setSource] = React.useState(lead.source_id ?? NONE)
  const [notes, setNotes] = React.useState(lead.notes ?? '')

  React.useEffect(() => {
    if (editing) return
    setSource(lead.source_id ?? NONE)
    setNotes(lead.notes ?? '')
  }, [lead.source_id, lead.notes, editing])

  const save = () => {
    const patch: LeadPatch = {}
    const nextSource = source === NONE ? null : source
    if (nextSource !== lead.source_id) patch.source_id = nextSource
    const nextNotes = notes.trim() === '' ? null : notes
    if (nextNotes !== lead.notes) patch.notes = nextNotes
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    onSave(patch, () => setEditing(false))
  }

  return (
    <LeadSection
      name="details"
      title="Details"
      actions={
        editing ? (
          <span className="flex items-center gap-xs">
            <Button
              variant="tertiary"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={pending} aria-busy={pending || undefined} onClick={save}>
              Save
            </Button>
          </span>
        ) : (
          <Button variant="tertiary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      <Select
        label="Source"
        items={[{ value: NONE, label: 'No source' }, ...sources]}
        value={source}
        disabled={!editing}
        onValueChange={setSource}
      />
      <Textarea
        label="Notes & preferences"
        rows={4}
        value={notes}
        readOnly={!editing}
        onChange={(event) => setNotes(event.target.value)}
      />
    </LeadSection>
  )
}
