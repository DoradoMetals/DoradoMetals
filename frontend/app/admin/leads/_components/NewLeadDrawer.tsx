'use client'

import * as React from 'react'
import {
  Alert,
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  Spinner,
  Textarea,
  type SelectItemShape,
} from '@dorado/components'
import { ApiError } from '@dorado/client'
import type { LeadPatch } from '@dorado/contracts'

const NONE = 'none'

export type NewLeadDrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  layout?: 'desktop' | 'mobile'
  sources: SelectItemShape[]
  preferences: SelectItemShape[]
  assignees: SelectItemShape[]
  pending?: boolean
  error?: Error | null
  onCreate: (lead: LeadPatch) => void
}

export function NewLeadDrawer({
  open,
  setOpen,
  layout = 'desktop',
  sources,
  preferences,
  assignees,
  pending = false,
  error = null,
  onCreate,
}: NewLeadDrawerProps) {
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [source, setSource] = React.useState(NONE)
  const [preference, setPreference] = React.useState(NONE)
  const [assignee, setAssignee] = React.useState(NONE)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (open) return
    setName('')
    setPhone('')
    setEmail('')
    setSource(NONE)
    setPreference(NONE)
    setAssignee(NONE)
    setNotes('')
  }, [open])

  const phoneTaken = error instanceof ApiError && error.status === 409
  const chosen = (value: string) => (value === NONE ? null : value)
  const canCreate = name.trim() !== '' && !pending

  const submit = () => {
    if (!canCreate) return
    onCreate({
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      source_id: chosen(source),
      contact_preference_id: chosen(preference),
      assigned_to_id: chosen(assignee),
      notes: notes.trim() || null,
    })
  }

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      size={layout === 'mobile' ? 'full' : 'sm'}
      label="New lead"
    >
      <DrawerHeader title="New lead" />
      <DrawerBody>
        <div className="flex flex-col gap-sm">
          {error != null && (
            <Alert intent="danger" title="Could not create the lead">
              Fix the field below, then try again.
            </Alert>
          )}
          <Input
            label="Name"
            value={name}
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            disabled={pending}
            invalid={phoneTaken}
            message={phoneTaken ? 'A lead with this phone number already exists.' : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            disabled={pending}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            label="Source"
            items={[{ value: NONE, label: 'No source' }, ...sources]}
            value={source}
            disabled={pending}
            onValueChange={setSource}
          />
          <Select
            label="Contact preference"
            items={[{ value: NONE, label: 'No preference' }, ...preferences]}
            value={preference}
            disabled={pending}
            onValueChange={setPreference}
          />
          <Select
            label="Assigned to"
            items={[{ value: NONE, label: 'Unowned' }, ...assignees]}
            value={assignee}
            disabled={pending}
            onValueChange={setAssignee}
          />
          <Textarea
            label="Notes"
            rows={4}
            value={notes}
            disabled={pending}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button disabled={!canCreate} aria-busy={pending || undefined} onClick={submit}>
          {pending ? (
            <>
              <Spinner size="sm" label="Creating" />
              Creating…
            </>
          ) : (
            'Create lead'
          )}
        </Button>
      </DrawerFooter>
    </Drawer>
  )
}
