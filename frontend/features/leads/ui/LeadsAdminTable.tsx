'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { Lead, LeadPriority } from '@/features/leads/types'
import { PrioritySelect } from '@/features/leads/ui/PrioritySelect'
import { useGetSession } from '@/features/auth/queries'
import { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { useDrawerStore } from '@/shared/store/drawerStore'
import {
  PlusIcon,
  InfoIcon,
  ChatsCircleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react'
import { TextColumn, ChipColumn } from '@/shared/ui/table/Columns'
import { DataTable } from '@/shared/ui/table/Table'
import { isValidEmail } from '@/shared/utils/isValid'
import LeadsDrawer from '@/features/leads/ui/LeadsDrawer'
import { useCreateLead, useLeads } from '@/features/leads/queries'
import { CreateConfig } from '@/shared/ui/table/CreateDialog'

export default function LeadsPage() {
  const { user } = useGetSession()
  const { data: leads = [] } = useLeads()
  const createLead = useCreateLead()
  const { openDrawer } = useDrawerStore()

  const [activeLead, setActiveLead] = React.useState<string | null>(null)

  const {
    respondedCount,
    convertedCount,
    contactedCount,
    respondedPct,
    convertedPct,
    contactedPct,
  } = React.useMemo(() => {
    const total = leads.length || 0
    const responded = leads.filter((l) => !!l.responded).length
    const converted = leads.filter((l) => !!l.converted).length
    const contacted = leads.filter((l) => !!l.contacted).length
    const pct = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 100))

    return {
      respondedCount: responded,
      convertedCount: converted,
      contactedCount: contacted,
      respondedPct: pct(responded, total),
      convertedPct: pct(converted, total),
      contactedPct: pct(contacted, total),
    }
  }, [leads])

  const columns: ColumnDef<Lead>[] = [
    TextColumn<Lead>({
      id: 'name',
      header: 'Name',
      accessorKey: 'name',
      align: 'left',
      enableHiding: false,
      size: 240,
    }),
    ChipColumn<Lead>({
      id: 'priority',
      header: 'Priority',
      accessorKey: 'priority',
      align: 'left',
      enableHiding: true,
      size: 160,
      getChip: ({ row }) => {
        const priority = (row as Lead).priority
        /* 'Medium' was `bg-primary/20 text-primary` - the neutral tone, which
           StatusChip fills solid rather than washing (a 15% white wash on a
           near-black ground is not a state anyone can see). */
        const tone = priority === 'High' ? 'danger' : priority === 'Low' ? 'success' : 'neutral'
        return { label: priority ?? 'Medium', tone } as const
      },
    }),
    TextColumn<Lead>({
      id: 'contact',
      header: 'Point of Contact',
      accessorKey: 'contact',
      align: 'left',
      enableHiding: true,
      formatValue: (value) => String(value ?? '').trim() || '—',
      size: 220,
    }),
    ChipColumn<Lead>({
      id: 'contacted',
      header: 'Contacted',
      accessorKey: 'contacted',
      align: 'left',
      enableHiding: true,
      size: 150,
      getChip: ({ row }) => {
        const contacted = !!(row as Lead).contacted
        return { label: contacted ? 'Yes' : 'No', tone: contacted ? 'success' : 'danger' } as const
      },
    }),
  ]

  const handleRowClick = (row: Row<Lead>) => {
    setActiveLead(row.original.id)
    openDrawer('leads')
  }

  const filterCards = [
    {
      key: 1,
      Icon: CheckCircleIcon,
      filter: 'converted',
      header: `${convertedPct}% (${convertedCount})`,
      label: 'Converted',
      predicate: (l: Lead) => !!l.converted,
    },
    {
      key: 2,
      Icon: ChatsCircleIcon,
      filter: 'responded',
      header: `${respondedPct}% (${respondedCount})`,
      label: 'Responded',
      predicate: (l: Lead) => !!l.responded,
    },
    {
      key: 3,
      Icon: InfoIcon,
      filter: 'contacted',
      header: `${contactedPct}% (${contactedCount})`,
      label: 'Contacted',
      predicate: (l: Lead) => !!l.contacted,
    },
  ]

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
        created_by: user?.name ?? '',
        updated_by: user?.name ?? '',
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
        data={leads}
        columns={columns}
        initialPageSize={12}
        searchColumnId="name"
        searchPlaceholder="Search leads..."
        createIcon={PlusIcon}
        enableColumnVisibility
        onRowClick={handleRowClick}
        filterCards={filterCards}
        createConfig={createConfig}
      />

      {activeLead && <LeadsDrawer lead_id={activeLead} leads={leads ?? []} />}
    </>
  )
}
