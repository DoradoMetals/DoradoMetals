'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { Lead } from '@/types/leads'
import { useGetSession } from '@/lib/queries/useAuth'
import formatPhoneNumber, { normalizePhone } from '@/utils/formatPhoneNumber'
import { useDrawerStore } from '@/store/drawerStore'
import LeadsDrawer from './leadsDrawer'
import {
  CheckIcon,
  XIcon,
  PlusIcon,
  InfoIcon,
  ChatsCircleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react'
import { TextColumn, IconColumn } from '@/components/table/columns'
import { DataTable } from '@/components/table/table'
import { isValidEmail } from '@/utils/isValid'
import { CreateConfig } from '@/components/table/addNew'
import { useCreateLead, useLeads } from '@/lib/queries/admin/useAdmin'

const BoolIcon = ({ value }: { value: boolean }) =>
  value ? (
    <CheckIcon size={20} className="text-success" />
  ) : (
    <XIcon size={20} className="text-destructive" weight="fill" />
  )

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
    TextColumn<Lead>({
      id: 'phone',
      header: 'Phone',
      accessorKey: 'phone',
      align: 'left',
      enableHiding: true,
      formatValue: (value) => formatPhoneNumber(String(value ?? '')),
      size: 180,
    }),
    TextColumn<Lead>({
      id: 'email',
      header: 'Email',
      accessorKey: 'email',
      align: 'left',
      enableHiding: true,
      size: 260,
    }),
    IconColumn<Lead>({
      id: 'contacted',
      header: 'Contacted',
      accessorKey: 'contacted',
      align: 'center',
      size: 90,
      renderIcon: ({ value }) => <BoolIcon value={!!value} />,
    }),
    IconColumn<Lead>({
      id: 'responded',
      header: 'Responded',
      accessorKey: 'responded',
      align: 'center',
      size: 90,
      renderIcon: ({ value }) => <BoolIcon value={!!value} />,
    }),
    IconColumn<Lead>({
      id: 'converted',
      header: 'Converted',
      accessorKey: 'converted',
      align: 'center',
      size: 90,
      renderIcon: ({ value }) => <BoolIcon value={!!value} />,
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
        getRowClassName={() => 'hover:bg-background hover:cursor-pointer'}
        filterCards={filterCards}
        createConfig={createConfig}
      />

      {activeLead && <LeadsDrawer lead_id={activeLead} leads={leads ?? []} />}
    </>
  )
}
