'use client'

import type { Lead } from '@dorado/contracts'
import * as React from 'react'

import { LeadPriority } from '../types'
import { PrioritySelect } from './PrioritySelect'
import { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { DataTable, type DataTableColumn, Badge, Button } from '@dorado/components'
import { Plus } from '@dorado/icons'
import { isValidEmail } from '@/shared/utils/isValid'
import LeadsDrawer from './LeadsDrawer'
import { useCreateLead, useLeads } from '../queries'
import { AddNewDialog, type CreateConfig } from '../../ui/CreateDialog'

export default function LeadsPage() {
  const { data: leads = [] } = useLeads()
  const createLead = useCreateLead()
  const { openDrawer } = useDrawerStore()

  const [activeLead, setActiveLead] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const columns: DataTableColumn<Lead>[] = [
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.original.priority
        /* 'Medium' was `bg-primary/20 text-primary` - the neutral tone, which
           Badge fills soft rather than washing (a 15% white wash on a
           near-black ground is not a state anyone can see). */
        const intent = priority === 'High' ? 'danger' : priority === 'Low' ? 'success' : 'neutral'
        return <Badge intent={intent}>{priority ?? 'Medium'}</Badge>
      },
    },
    {
      accessorKey: 'contact',
      header: 'Point of Contact',
      cell: ({ row }) => String(row.original.contact ?? '').trim() || '—',
    },
    {
      accessorKey: 'contacted',
      header: 'Contacted',
      cell: ({ row }) => {
        const contacted = !!row.original.contacted
        return <Badge intent={contacted ? 'success' : 'danger'}>{contacted ? 'Yes' : 'No'}</Badge>
      },
    },
  ]

  const handleRowClick = (row: Lead) => {
    setActiveLead(row.id)
    openDrawer('leads')
  }

  const createConfig: CreateConfig = {
    title: 'Create New Lead',
    submitLabel: 'Create Lead',
    fields: [
      {
        name: 'name',
        label: 'Name',
        inputType: 'text',
      },
      {
        name: 'phone',
        label: 'Phone Number',
        inputType: 'tel',
        inputMode: 'tel',
        autoComplete: 'tel',
        maxLength: 17,
      },
      {
        name: 'email',
        label: 'Email',
        inputType: 'email',
      },
      {
        name: 'priority',
        label: 'Priority',
        render: ({ value, setValue }) => (
          <PrioritySelect
            value={(value || 'Medium') as LeadPriority}
            onChange={(v) => setValue('priority', v)}
          />
        ),
      },
      {
        name: 'notes',
        label: 'Notes',
        multiline: true,
      },
    ],
    createNew: (values: Record<string, string>) => {
      const name = values.name ?? ''
      const rawPhone = values.phone ?? ''
      const phoneDigits = normalizePhone(rawPhone)
      const email = values.email ?? ''

      createLead.mutate({
        name,
        phone: phoneDigits,
        email: email || 'null',
        priority: (values.priority as LeadPriority) || 'Medium',
        notes: values.notes ?? '',
      })
    },
    canSubmit: (values: Record<string, string>) => {
      const rawPhone = values.phone ?? ''
      const phoneDigits = normalizePhone(rawPhone)
      const hasPhone = phoneDigits.replace(/\D/g, '').length >= 10
      const email = values.email ?? ''
      const emailOk = isValidEmail(email)
      return (hasPhone || (!!email && emailOk)) && emailOk
    },
  }

  return (
    <>
      <DataTable<Lead>
        label="Leads"
        data={leads}
        columns={columns}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        searchable
        searchPlaceholder="Search leads..."
        actions={
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create Lead"
            title="Create Lead"
          >
            <Plus size={20} />
          </Button>
        }
      />

      <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />

      {activeLead && <LeadsDrawer lead_id={activeLead} leads={leads ?? []} />}
    </>
  )
}
