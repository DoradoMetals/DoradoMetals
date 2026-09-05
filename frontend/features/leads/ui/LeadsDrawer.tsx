'use client'

import type { Lead, LeadPatch } from '@dorado/contracts'
import { useDrawerRecord } from '@/shared/hooks/useDrawerRecord'
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, isValid, parse, parseISO } from 'date-fns'

import { formatFullDate, formatPickupDateShort, formatPickupTime } from '@/shared/utils/formatDates'

import { LeadPriority } from '@/features/leads/types'
import { PrioritySelect } from '@/features/leads/ui/PrioritySelect'
import { useCreateUser } from '@/features/auth/queries'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import {
  Autocomplete,
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  Field,
  Input,
  Switch,
  Textarea,
  type TimeGroup,
} from '@dorado/components'
import { Trash2, UserPlus } from '@dorado/icons'
import { isValidEmail } from '@/shared/utils/isValid'
import { useDeleteLead, useUpdateLead } from '@/features/leads/queries'
import { useAdminRoleUsers, useAdminUsers } from '@dorado/client'

function toLocalDateISO(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function buildLocalDateTime(dateISO: string, time: string) {
  const [y, mo, da] = dateISO.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, mo - 1, da, hh, mm, 0, 0)
}

function hasTimezoneSuffix(v: string) {
  return /([zZ]|[+\-]\d{2}:\d{2})$/.test(v)
}

function parseScheduled(value: string) {
  const d = hasTimezoneSuffix(value)
    ? parseISO(value)
    : parse(value, "yyyy-MM-dd'T'HH:mm:ss", new Date())

  return isValid(d) ? d : null
}

function toOffsetISO(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm:ssxxx")
}

function buildTimeGroups(): TimeGroup[] {
  const slots: TimeGroup['slots'] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      slots.push({ value, label: formatPickupTime(value) })
    }
  }
  return [{ label: 'Time', slots }]
}

const CONTACTED_TIME_GROUPS = buildTimeGroups()

export default function LeadsDrawer({ leads, lead_id }: { leads: Lead[]; lead_id: string }) {
  const { open, record: lead, close } = useDrawerRecord('leads', leads, lead_id)
  const updateLead = useUpdateLead()

  if (!lead) {
    return null
  }

  const handleUpdate = (patch: LeadPatch) => {
    updateLead.mutate({ lead_id: lead.id, patch })
  }

  return (
    <Drawer label="Lead" open={open} setOpen={close}>
      <Header lead={lead} />
      <hr />
      <div className="space-y-8">
        <Details lead={lead} onUpdate={handleUpdate} />
        <hr />
        <Booleans lead={lead} onUpdate={handleUpdate} />
        <hr />
        <Contacted lead={lead} onUpdate={handleUpdate} />
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

function Details({ lead, onUpdate }: { lead: Lead; onUpdate: (patch: LeadPatch) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>

      <Field label="Priority">
        <PrioritySelect
          value={(lead.priority ?? 'Medium') as LeadPriority}
          onChange={(v) => onUpdate({ priority: v })}
        />
      </Field>

      <Input
        id="name"
        label="Name"
        placeholder="Enter name..."
        type="text"
        defaultValue={lead.name ?? ''}
        onBlur={(e) => onUpdate({ name: e.target.value })}
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
          onUpdate({ phone: digits })
        }}
      />

      <Input
        id="email"
        label="Email"
        placeholder="Enter email..."
        type="text"
        defaultValue={lead.email ?? ''}
        onBlur={(e) => onUpdate({ email: e.target.value })}
      />

      <Textarea
        rows={20}
        id="Notes"
        label="Notes"
        className="w-full min-w-70"
        placeholder="Enter lead notes..."
        defaultValue={lead.notes ?? ''}
        onBlur={(e) => onUpdate({ notes: e.target.value })}
      />
    </div>
  )
}

function Booleans({ lead, onUpdate }: { lead: Lead; onUpdate: (patch: LeadPatch) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Booleans</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <Switch
          label="Contacted"
          checked={!!lead.contacted}
          onCheckedChange={(v) => onUpdate({ contacted: v })}
        />
        <Switch
          label="Responded"
          checked={!!lead.responded}
          onCheckedChange={(v) => onUpdate({ responded: v })}
        />
        <Switch
          label="Converted"
          checked={!!lead.converted}
          onCheckedChange={(v) => onUpdate({ converted: v })}
        />
      </div>
    </div>
  )
}

function Contacted({ lead, onUpdate }: { lead: Lead; onUpdate: (patch: LeadPatch) => void }) {
  const { data: admins = [] } = useAdminRoleUsers()
  const [contactQuery, setContactQuery] = useState(lead.contact ?? '')

  useEffect(() => {
    setContactQuery(lead.contact ?? '')
  }, [lead.id, lead.contact])

  const maxDate = useMemo(() => new Date(), [])
  const minDate = useMemo(() => new Date('2025-03-01T00:00:00'), [])

  const lastContacted = lead.last_contacted ? new Date(lead.last_contacted).toISOString() : null

  const selectedDateTime = useMemo(
    () => (lastContacted ? parseScheduled(lastContacted) : null),
    [lastContacted]
  )
  const selectedDateISO = selectedDateTime ? toLocalDateISO(selectedDateTime) : null
  const selectedTime = selectedDateTime
    ? `${String(selectedDateTime.getHours()).padStart(2, '0')}:${String(
        selectedDateTime.getMinutes()
      ).padStart(2, '0')}:00`
    : null

  const emitDateTime = (d: Date) =>
    onUpdate({ last_contacted: new Date(toOffsetISO(d)).toISOString() })

  const selectDate = (newDate: Date | undefined) => {
    if (!newDate) return
    const dateISO = toLocalDateISO(newDate)
    emitDateTime(buildLocalDateTime(dateISO, selectedTime ?? '12:00:00'))
  }

  const selectTime = (t: string) => {
    const baseDateISO = selectedDateISO ?? toLocalDateISO(new Date())
    emitDateTime(buildLocalDateTime(baseDateISO, t))
  }

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
            onUpdate({ contact: item.textValue })
          }}
        />

        <Field label="Last Contacted" className="w-full">
          <DatePicker
            mode="single"
            selected={selectedDateTime ?? undefined}
            onSelect={selectDate}
            disabled={[{ before: minDate }, { after: maxDate }]}
            timeGroups={CONTACTED_TIME_GROUPS}
            timeValue={selectedTime}
            onTimeChange={selectTime}
            timeHeading={selectedDateISO ? formatPickupDateShort(selectedDateISO) : 'Select date'}
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
          <p className="text-destructive">{createUser.error ? createUser.error.message : null}</p>

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
