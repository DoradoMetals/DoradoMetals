'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'
import { useMemo, useRef, useState } from 'react'

import { formatFullDate } from '@/utils/dateFormatting'

import { Lead } from '@/types/leads'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDeleteLead, useUpdateLead } from '@/lib/queries/useLeads'
import { useCreateUser, useGetSession } from '@/lib/queries/useAuth'
import { DisplayToggle } from '@/components/ui/displayToggle'
import formatPhoneNumber, { normalizePhone } from '@/utils/formatPhoneNumber'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { TrashIcon, UserPlusIcon, XIcon } from '@phosphor-icons/react'
import { useAdminRoleUsers, useAdminUsers } from '@/lib/queries/admin/useAdminUser'
import { PopoverSelect } from '@/components/table/popoverSelect'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { isValidEmail } from '@/utils/isValid'

export default function LeadsDrawer({ leads, lead_id }: { leads: Lead[]; lead_id: string }) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'leads'

  const lead = useMemo(() => leads.find((u) => u.id === lead_id), [leads, lead_id])

  if (!lead) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col flex-1 h-full space-y-4 p-5 overflow-y-scroll sm:overflow-y-auto pb-30 sm:pb-5 bg-background w-full">
        <Header lead={lead} />
        <div className="separator-inset" />
        <Details lead={lead} />
        <div className="separator-inset" />
        <Booleans lead={lead} />
        <div className="separator-inset" />
        <Contacted lead={lead} />
        <div className="separator-inset" />
        <Actions lead={lead} />
      </div>
    </Drawer>
  )
}

function Header({ lead }: { lead: Lead }) {
  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex w-full items-end justify-between">
        <div className="text-2xl text-neutral-900">{lead.name}</div>
        <div
          className={cn(
            'px-2 py-1 border-1 rounded-lg flex justify-center items-center font-semibold text-sm',
            lead.converted
              ? 'bg-success/20 text-success border-success'
              : 'bg-destructive/20 text-destructive border-destructive'
          )}
        >
          {lead.converted ? 'Converted' : 'Not Converted'}
        </div>
      </div>
      <div className="flex w-full justify-start text-xs gap-1">
        <span className="text-neutral-600">Updated by</span>
        <span className="text-neutral-800">{lead.updated_by}</span>
        <span className="text-neutral-600">on</span>
        <span className="text-neutral-800">{formatFullDate(lead.updated_at)}</span>
      </div>
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
      <div className="section-label mb-4">Details</div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="name" className="text-xs pl-1 font-medium text-neutral-700">
          Product Name
        </Label>

        <Input
          id="name"
          placeholder="Enter name..."
          type="text"
          className="input-floating-label-form"
          defaultValue={lead.name ?? ''}
          onBlur={(e) => handleUpdate({ name: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="phone" className="text-xs pl-1 font-medium text-neutral-700">
          Phone Number
        </Label>

        <Input
          ref={inputRef}
          type="text"
          inputMode="tel"
          autoComplete="tel"
          className="input-floating-label-form"
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
        <Label htmlFor="name" className="text-xs pl-1 font-medium text-neutral-700">
          Product Name
        </Label>

        <Input
          id="name"
          placeholder="Enter name..."
          type="text"
          className="input-floating-label-form"
          defaultValue={lead.email ?? ''}
          onBlur={(e) => handleUpdate({ email: e.target.value })}
        />
      </div>

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="notes" className="text-xs pl-1 font-medium text-neutral-700">
          Notes
        </Label>
        <Textarea
          rows={20}
          id="Notes"
          placeholder="Enter lead notes..."
          className="input-floating-label-form min-w-70"
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
      <div className="section-label">Booleans</div>

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

  const maxDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate())
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const minDate = useMemo(() => {
    const d = new Date('2025-03-01T00:00:00Z')
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const clampDate = (d: Date, min: Date, max: Date) => (d < min ? min : d > max ? max : d)

  const selectedDate = useMemo<Date>(() => {
    const raw = lead.last_contacted ? new Date(lead.last_contacted) : maxDate
    raw.setHours(0, 0, 0, 0)
    return clampDate(raw, minDate, maxDate)
  }, [lead.last_contacted, minDate, maxDate])

  const startMonth = useMemo(() => firstOfMonth(minDate), [minDate])
  const endMonth = useMemo(() => firstOfMonth(maxDate), [maxDate])

  return (
    <div className="flex flex-col gap-4">
      <div className="section-label">Contact Info</div>

      <div className="flex flex-col md:flex-row w-full justify-center md:justify-between gap-3 items-start">
        <PopoverSelect
          value={lead.contact}
          options={admins?.map((a) => a.name)}
          onChange={(val) => handleUpdate({ contact: val })}
          triggerClass="raised-off-page rounded-lg"
        />

        <Calendar
          mode="single"
          showOutsideDays={false}
          startMonth={startMonth}
          endMonth={endMonth}
          defaultMonth={selectedDate}
          selected={selectedDate}
          onSelect={(newDate) => {
            if (!newDate) return
            const d = new Date(newDate)
            d.setHours(0, 0, 0, 0)
            if (d < minDate || d > maxDate) return
            handleUpdate({ last_contacted: d })
          }}
          className="p-2 bg-card w-full raised-off-page rounded-lg"
          disabled={[{ before: minDate }, { after: maxDate }]}
        />
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
      <div className="section-label">Booleans</div>

      <div className="flex flex-col w-full gap-3">
        <div className="flex flex-col items-start gap-1">
          <div className="text-red-600 text-destructive">
            {createUser.error ? createUser.error.message : null}
          </div>

          <Button
            variant="ghost"
            className="flex items-center w-full gap-3 justify-center text-white hover:text-white bg-success hover:bg-success w-full p-4 raised-off-page"
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
                variant="ghost"
                className="flex items-center w-full gap-3 justify-center text-white hover:text-white bg-destructive hover:bg-destructive w-full p-4 raised-off-page"
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
            <div className="text-sm text-neutral-700">
              This will permanently delete <strong>{lead.name || lead.email || lead.phone}</strong>.
            </div>
            <DialogFooter className="pt-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
