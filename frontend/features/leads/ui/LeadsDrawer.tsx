'use client'

import type { Lead, LeadPatch } from "@dorado/contracts";
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useEffect, useMemo, useRef, useState } from 'react'

import { formatFullDate } from '@/shared/utils/formatDates'

import { LeadPriority } from '@/features/leads/types'
import { PrioritySelect } from '@/features/leads/ui/PrioritySelect'
import { useCreateUser } from '@/features/auth/queries'
import { SegmentedField } from '@/shared/ui/SegmentedField'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import SchedulePicker from '@/shared/ui/SchedulePicker'
import { Autocomplete, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Drawer, Field, Input, Textarea } from '@dorado/components'
import { Trash2, UserPlus } from '@dorado/icons'
import { isValidEmail } from '@/shared/utils/isValid'
import { useDeleteLead, useUpdateLead } from '@/features/leads/queries'
import { useAdminRoleUsers, useAdminUsers } from '@dorado/client'

export default function LeadsDrawer({ leads, lead_id }: { leads: Lead[]; lead_id: string }) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'leads'

  const lead = useMemo(() => leads.find((u) => u.id === lead_id), [leads, lead_id])

  if (!lead) {
    return null
  }

  return (
    <Drawer label="Lead" open={isDrawerOpen} setOpen={closeDrawer}>
      <Header lead={lead} />
      <hr />
      <div className="space-y-8">
        <Details lead={lead} />
        <hr />
        <Booleans lead={lead} />
        <hr />
        <Contacted lead={lead} />
        <hr />
        <Actions lead={lead} />
        <hr />
      </div>
    </Drawer>
  )
}

function Header({ lead }: { lead: Lead }) {
  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex w-full items-end justify-between">
        <h2>{lead.name}</h2>
        <Badge intent={lead.converted ? 'success' : 'danger'} size="lg">
          {lead.converted ? 'Converted' : 'Not Converted'}
        </Badge>
      </div>
    </div>
  )
}

function Details({ lead }: { lead: Lead }) {
  const updateLead = useUpdateLead()

  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleUpdate = (patch: LeadPatch) => {
    updateLead.mutate({ lead_id: lead.id, patch })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>

      <Field label="Priority">
        <PrioritySelect
          value={(lead.priority ?? 'Medium') as LeadPriority}
          onChange={(v) => handleUpdate({ priority: v })}
        />
      </Field>

      <Input
        id="name"
        label="Name"
        placeholder="Enter name..."
        type="text"
        defaultValue={lead.name ?? ''}
        onBlur={(e) => handleUpdate({ name: e.target.value })}
      />

      <Input
        ref={inputRef}
        id="phone"
        label="Phone Number"
        type="text"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={formatPhoneNumber(normalizePhone(lead.phone))}
        maxLength={17}
        onChange={(e) => {
          const digits = normalizePhone(e.target.value)
          e.currentTarget.value = formatPhoneNumber(digits)
        }}
        onBlur={(e) => {
          const digits = normalizePhone(e.target.value)
          handleUpdate({ phone: digits })
        }}
      />

      <Input
        id="email"
        label="Email"
        placeholder="Enter email..."
        type="text"
        defaultValue={lead.email ?? ''}
        onBlur={(e) => handleUpdate({ email: e.target.value })}
      />

      <Textarea
        rows={20}
        id="Notes"
        label="Notes"
        className="w-full min-w-70"
        placeholder="Enter lead notes..."
        defaultValue={lead.notes ?? ''}
        onBlur={(e) => handleUpdate({ notes: e.target.value })}
      />
    </div>
  )
}

function Booleans({ lead }: { lead: Lead }) {
  const updateLead = useUpdateLead()

  const handleUpdate = (patch: LeadPatch) => {
    updateLead.mutate({ lead_id: lead.id, patch })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Booleans</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <SegmentedField
          label="Contacted"
          value={!!lead.contacted}
          onChange={(v) => handleUpdate({ contacted: v })}
          className="w-full"
        />
        <SegmentedField
          label="Responded"
          value={!!lead.responded}
          onChange={(v) => handleUpdate({ responded: v })}
          className="w-full"
        />
        <SegmentedField
          label="Converted"
          value={!!lead.converted}
          onChange={(v) => handleUpdate({ converted: v })}
          className="w-full"
        />
      </div>
    </div>
  )
}

function Contacted({ lead }: { lead: Lead }) {
  const updateLead = useUpdateLead()
  const { data: admins = [] } = useAdminRoleUsers()
  const [contactQuery, setContactQuery] = useState(lead.contact ?? '')

  // The drawer instance persists across records, so the typed query has to
  // resync when a different lead's contact replaces it underneath.
  useEffect(() => {
    setContactQuery(lead.contact ?? '')
  }, [lead.id, lead.contact])

  const handleUpdate = (patch: LeadPatch) => {
    updateLead.mutate({ lead_id: lead.id, patch })
  }

  // last_contacted is historical, so allow past dates (back to launch) and
  // disable the future.
  const maxDate = useMemo(() => new Date(), [])
  const minDate = useMemo(() => new Date('2025-03-01T00:00:00'), [])

  const lastContacted = lead.last_contacted ? new Date(lead.last_contacted).toISOString() : null

  const contactItems = admins
    .filter((a) => (a.name ?? '').toLowerCase().includes(contactQuery.trim().toLowerCase()))
    .map((a) => ({ id: a.id, textValue: a.name ?? '', label: a.name ?? '' }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col w-full gap-4 items-start">
        <Autocomplete
          label="Point of Contact"
          className="w-full"
          value={contactQuery}
          onValueChange={setContactQuery}
          items={contactItems}
          onSelect={(item) => {
            setContactQuery(item.textValue)
            handleUpdate({ contact: item.textValue })
          }}
        />

        <Field label="Last Contacted" className="w-full">
          <SchedulePicker
            value={lastContacted}
            // The column is a timestamp and the wire carries it as a string. A Date
            // was built here and serialised on the way out, so the ISO string is the
            // same value sent one step earlier.
            onChange={(iso) => handleUpdate({ last_contacted: iso ? new Date(iso).toISOString() : null })}
            minDate={minDate}
            maxDate={maxDate}
          />
        </Field>
      </div>
    </div>
  )
}

function Actions({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false)
  const { data: users = [] } = useAdminUsers()
  const createUser = useCreateUser()
  const deleteLead = useDeleteLead()

  const normalizeEmail = (e?: string | null) => (e ?? '').trim().toLowerCase()
  const email = normalizeEmail(lead.email)

  const emailValid = email.length > 0 && isValidEmail(email)
  const userExists = users.some((u) => normalizeEmail(u.email) === email)

  const canCreate = emailValid && !userExists && !createUser.isPending

  const handleCreateNewUser = () => {
    if (!canCreate) return
    createUser.mutate({ email: email, name: lead.name })
  }

  const handleConfirmDelete = () => {
    deleteLead.mutate(lead)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <p className="eyebrow">Actions</p>

      <div className="flex flex-col w-full gap-3">
        <div className="flex flex-col items-start gap-1">
          <p className="text-destructive">
            {createUser.error ? createUser.error.message : null}
          </p>

          <Button
            variant="secondary"
            intent="success"
            className="flex items-center w-full gap-3 justify-center"
            onClick={handleCreateNewUser}
            disabled={!canCreate}
          >
            <UserPlus size={18} />
            {!emailValid
              ? 'Invalid Email'
              : userExists
              ? 'User Already Exists'
              : createUser.isPending
              ? 'Creating...'
              : 'Create User'}
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <div className="flex">
              <Button
                variant="secondary"
                intent="danger"
                className="flex items-center w-full gap-3 justify-center"
              >
                <Trash2 size={18} />
                Delete Lead
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Lead?</DialogTitle>
            </DialogHeader>
            <p>
              This will permanently delete <strong>{lead.name || lead.email || lead.phone}</strong>.
            </p>
            <DialogFooter className="pt-4">
              <Button variant="tertiary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button intent="danger" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
