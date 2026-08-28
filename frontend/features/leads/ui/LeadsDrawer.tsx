'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo, useRef, useState } from 'react'

import { formatFullDate } from '@/shared/utils/formatDates'
import StatusChip from '@/shared/ui/StatusChip'
import UpdatedByline from '@/shared/ui/UpdatedByline'

import { Lead, LeadPriority } from '@/features/leads/types'
import { PrioritySelect } from '@/features/leads/ui/PrioritySelect'
import { Label } from '@/shared/ui/base/label'
import { Input } from '@/shared/ui/base/input'
import { Textarea } from '@/shared/ui/base/textarea'
import { useCreateUser, useGetSession } from '@/features/auth/queries'
import { DisplayToggle } from '@/shared/ui/DisplayToggle'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import SchedulePicker from '@/shared/ui/SchedulePicker'
import { Button } from '@/shared/ui/base/button'
import { TrashIcon, UserPlusIcon } from '@phosphor-icons/react'
import { PopoverSelect } from '@/shared/ui/table/PopoverSelect'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/base/dialog'
import { isValidEmail } from '@/shared/utils/isValid'
import { useDeleteLead, useUpdateLead } from '@/features/leads/queries'
import { useAdminRoleUsers, useAdminUsers } from '@/features/users/queries'

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
        <StatusChip positive={lead.converted} size="lg">
          {lead.converted ? 'Converted' : 'Not Converted'}
        </StatusChip>
      </div>
      <UpdatedByline name={lead.updated_by} date={formatFullDate(lead.updated_at)} />
    </div>
  )
}

function Details({ lead }: { lead: Lead }) {
  const { user } = useGetSession()
  const updateLead = useUpdateLead()

  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleUpdate = (updatedFields: Partial<Lead>) => {
    const updated = { ...lead, ...updatedFields }
    updateLead.mutate({ lead: updated, user_name: user?.name ?? '' })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>

      <div className="flex flex-col gap-1">
        <Label className="pl-1">Priority</Label>
        <PrioritySelect
          value={(lead.priority ?? 'Medium') as LeadPriority}
          onChange={(v) => handleUpdate({ priority: v })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="name" className="pl-1">
          Name
        </Label>

        <Input
          id="name"
          placeholder="Enter name..."
          type="text"
          defaultValue={lead.name ?? ''}
          onBlur={(e) => handleUpdate({ name: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="phone" className="pl-1">
          Phone Number
        </Label>

        <Input
          ref={inputRef}
          id="phone"
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
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="email" className="pl-1">
          Email
        </Label>

        <Input
          id="email"
          placeholder="Enter email..."
          type="text"
          defaultValue={lead.email ?? ''}
          onBlur={(e) => handleUpdate({ email: e.target.value })}
        />
      </div>

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="notes" className="pl-1">
          Notes
        </Label>
        <Textarea
          rows={20}
          id="Notes"
          placeholder="Enter lead notes..."
          className="min-w-70"
          defaultValue={lead.notes}
          onBlur={(e) => handleUpdate({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

function Booleans({ lead }: { lead: Lead }) {
  const { user } = useGetSession()
  const updateLead = useUpdateLead()

  const handleUpdate = (updatedFields: Partial<Lead>) => {
    const updated = { ...lead, ...updatedFields }
    updateLead.mutate({ lead: updated, user_name: user?.name ?? '' })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Booleans</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <DisplayToggle
          label="Contacted"
          value={!!lead.contacted}
          onChange={(v) => handleUpdate({ contacted: v })}
          className="w-full"
        />
        <DisplayToggle
          label="Responded"
          value={!!lead.responded}
          onChange={(v) => handleUpdate({ responded: v })}
          className="w-full"
        />
        <DisplayToggle
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
  const { user } = useGetSession()
  const updateLead = useUpdateLead()
  const { data: admins = [] } = useAdminRoleUsers()

  const handleUpdate = (updatedFields: Partial<Lead>) => {
    const updated = { ...lead, ...updatedFields }
    updateLead.mutate({ lead: updated, user_name: user?.name ?? '' })
  }

  // last_contacted is historical, so allow past dates (back to launch) and
  // disable the future.
  const maxDate = useMemo(() => new Date(), [])
  const minDate = useMemo(() => new Date('2025-03-01T00:00:00'), [])

  const lastContacted = lead.last_contacted ? new Date(lead.last_contacted).toISOString() : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col w-full gap-4 items-start">
        <div className="flex flex-col w-full gap-1">
          <Label className="pl-1">Point of Contact</Label>
          <PopoverSelect
            value={lead.contact}
            options={admins?.map((a) => a.name)}
            onChange={(val) => handleUpdate({ contact: val })}
            variant="secondary"
          />
        </div>

        <div className="flex flex-col w-full gap-1">
          <Label className="pl-1">Last Contacted</Label>
          <SchedulePicker
            value={lastContacted}
            onChange={(iso) => handleUpdate({ last_contacted: iso ? new Date(iso) : null })}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
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
            <UserPlusIcon size={18} />
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
                <TrashIcon size={18} />
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
