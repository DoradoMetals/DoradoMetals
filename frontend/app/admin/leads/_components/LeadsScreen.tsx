'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import {
  AdminHeader,
  Alert,
  Breadcrumb,
  Button,
  Chip,
  EmptyState,
  Input,
  useDebounce,
  useMediaUp,
  type DateRange,
} from '@dorado/components'
import { Download, RotateCcw, Search, Trash2, UserCheck, UserPlus, Users } from '@dorado/icons'
import type { LeadSummaryWindow, LeadView } from '@dorado/contracts'
import type { LeadListFilters } from '@dorado/client'

import { protectedRoutes } from '@/shared/types/routes'

import { AdminTabs } from '../../_components'
import {
  useActivityFeed,
  useArchiveMany,
  useAssign,
  useAssigneeLoads,
  useCreate,
  useExport,
  useLeadList,
  usePreferences,
  usePricedTotals,
  useRestoreMany,
  useSources,
  useStaff,
  useSummary,
} from '../_api'
import { formatLeadTotals, saveBlob, stageOf, toIsoDate, type StatusFilter } from '../_lib'
import { AssignLeadsDrawer } from './AssignLeadsDrawer'
import { ConvertLeadFlow } from './ConvertLeadFlow'
import { DeleteLeadDialog } from './DeleteLeadDialog'
import { LeadActivityFeed } from './LeadActivityFeed'
import { ANY_SOURCE, ANYONE, LeadFilterBar } from './LeadFilterBar'
import { LeadStatTiles } from './LeadStatTiles'
import { LeadTable, type LeadTableSort } from './LeadTable'
import { NewLeadDrawer } from './NewLeadDrawer'

const PAGE_SIZE = 25

const PEOPLE = ['Leads', 'Users', 'Employees', 'Inbox']

const DEFAULT_SORT: LeadTableSort = { key: 'created', direction: 'desc' }

function nextDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}

export function LeadsScreen() {
  const router = useRouter()
  const mobile = !useMediaUp('lg')
  const layout = mobile ? 'mobile' : 'desktop'

  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [source, setSource] = React.useState(ANY_SOURCE)
  const [assignee, setAssignee] = React.useState(ANYONE)
  const [range, setRange] = React.useState<DateRange | undefined>()
  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<LeadTableSort>(DEFAULT_SORT)
  const [page, setPage] = React.useState(1)
  const [deleting, setDeleting] = React.useState<LeadView[]>([])
  const [assigning, setAssigning] = React.useState<LeadView[]>([])
  const [converting, setConverting] = React.useState<LeadView | null>(null)
  const [creating, setCreating] = React.useState(false)
  const q = useDebounce(search, 300).trim()

  const window: LeadSummaryWindow = {
    ...(range?.from ? { created_from: toIsoDate(range.from) } : {}),
    ...(range?.from ? { created_to: toIsoDate(nextDay(range.to ?? range.from)) } : {}),
  }

  const filters: LeadListFilters = {
    stage: stageOf(status),
    archived: status === 'Archived',
    source_id: source === ANY_SOURCE ? null : source,
    assigned_to: assignee === ANYONE ? null : assignee,
    q: q === '' ? null : q,
    ...window,
    sort: sort.key,
    direction: sort.direction,
    page,
    page_size: PAGE_SIZE,
  }

  const list = useLeadList(filters)
  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  React.useEffect(() => {
    if (list.data && page > pageCount) setPage(pageCount)
  }, [list.data, page, pageCount])
  const totals = usePricedTotals(rows.map((row) => row.id)).data ?? []
  const summary = useSummary(window).data
  const sources = useSources().data ?? []
  const preferences = usePreferences().data ?? []
  const staff = (useStaff().data ?? []).filter((employee) => employee.enabled)
  const activity = useActivityFeed().data
  const loads = useAssigneeLoads(assigning.length > 0).data

  const archive = useArchiveMany()
  const restore = useRestoreMany()
  const assign = useAssign()
  const create = useCreate()
  const exporter = useExport()

  const sourceItems = sources.map((row) => ({ value: row.id, label: row.label }))
  const staffItems = staff.map((employee) => ({ value: employee.user_id, label: employee.name }))
  const sourceName = (id: string | null) => sources.find((row) => row.id === id)?.label ?? '—'
  const ownerName = (id: string | null) =>
    id == null ? 'Unassigned' : (staff.find((row) => row.user_id === id)?.name ?? 'Unassigned')

  const archivedView = status === 'Archived'

  const refilter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  const reset = () => {
    setStatus('all')
    setSource(ANY_SOURCE)
    setAssignee(ANYONE)
    setRange(undefined)
    setSearch('')
    setSort(DEFAULT_SORT)
    setPage(1)
  }

  const actions = ({ selected: picked }: { selected: LeadView[] }) => (
    <div className="flex items-center gap-xs">
      <Button
        variant="secondary"
        size="iconSm"
        aria-label="Export"
        disabled={exporter.isPending}
        onClick={() =>
          exporter.mutate(
            { ...filters, page: null, page_size: null },
            { onSuccess: (blob) => saveBlob(blob, 'leads.csv') }
          )
        }
      >
        <Download aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="iconSm"
        aria-label="Assign"
        disabled={picked.length === 0}
        onClick={() => setAssigning(picked)}
      >
        <UserPlus aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="iconSm"
        aria-label="Convert"
        disabled={picked.length !== 1 || archivedView}
        onClick={() => setConverting(picked[0] ?? null)}
      >
        <UserCheck aria-hidden />
      </Button>
      {archivedView ? (
        <Button
          variant="secondary"
          size="iconSm"
          aria-label="Restore"
          disabled={picked.length === 0 || restore.isPending}
          onClick={() => restore.mutate(picked.map((row) => row.id))}
        >
          <RotateCcw aria-hidden />
        </Button>
      ) : (
        <Button
          variant="secondary"
          intent="danger"
          size="iconSm"
          aria-label="Delete"
          disabled={picked.length === 0}
          onClick={() => setDeleting(picked)}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  )

  const empty = (
    <EmptyState
      icon={<Users aria-hidden />}
      title="No leads here"
      description="Clear the filters, or add a lead."
      action={
        <Button variant="secondary" size="sm" onClick={reset}>
          Clear filters
        </Button>
      }
    />
  )

  return (
    <>
      <AdminHeader
        title="Leads"
        layout={layout}
        nav={<AdminTabs active="people" />}
        breadcrumb={
          mobile ? undefined : (
            <Breadcrumb
              linkComponent={NextLink}
              items={[{ label: 'Admin', href: protectedRoutes.admin.path }, { label: 'Leads' }]}
            />
          )
        }
        chips={PEOPLE.map((label) => (
          <Chip
            key={label}
            label={label}
            selected={label === 'Leads'}
            aria-current={label === 'Leads' ? 'page' : undefined}
            disabled={label !== 'Leads'}
          />
        ))}
        totals={summary ? formatLeadTotals(summary.totals) : undefined}
        search={
          <Input
            aria-label="Search leads"
            placeholder="Name, phone or email"
            leading={<Search aria-hidden />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            className={mobile ? undefined : 'w-100'}
          />
        }
        action={<Button onClick={() => setCreating(true)}>New lead</Button>}
        filters={
          <LeadFilterBar
            layout={layout}
            sources={sourceItems}
            assignees={staffItems}
            source={source}
            onSourceChange={refilter(setSource)}
            assignee={assignee}
            onAssigneeChange={refilter(setAssignee)}
            status={status}
            onStatusChange={refilter(setStatus)}
            counts={summary?.counts_by_status}
            range={range}
            onRangeChange={refilter(setRange)}
          />
        }
        reset={
          <Button variant="tertiary" size="sm" onClick={reset}>
            Reset
          </Button>
        }
        count={list.data ? `${total} matching` : undefined}
      />

      <div className="grid grid-cols-1 gap-md lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-lg">
        <div className="flex min-w-0 flex-col gap-md">
          <LeadTable
            layout={layout}
            rows={rows}
            total={total}
            pageSize={PAGE_SIZE}
            totals={totals}
            sourceName={sourceName}
            ownerName={ownerName}
            sort={sort}
            onSortChange={refilter(setSort)}
            actions={actions}
            loading={list.isPending}
            error={list.isError ? "Couldn't load leads" : undefined}
            empty={empty}
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            onPageChange={setPage}
          />
          {list.isError && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => list.refetch()}
            >
              Try again
            </Button>
          )}
          {(archive.isError || restore.isError || exporter.isError) && (
            <Alert intent="danger" title="That didn't go through">
              Check the selection, then try again.
            </Alert>
          )}
          <LeadStatTiles summary={summary} />
        </div>
        <LeadActivityFeed entries={activity} />
      </div>

      <DeleteLeadDialog
        open={deleting.length > 0}
        count={deleting.length}
        pending={archive.isPending}
        onCancel={() => setDeleting([])}
        onConfirm={() =>
          archive.mutate(
            deleting.map((row) => row.id),
            { onSettled: () => setDeleting([]) }
          )
        }
      />

      <AssignLeadsDrawer
        open={assigning.length > 0}
        setOpen={(open) => !open && setAssigning([])}
        layout={layout}
        count={assigning.length}
        assignees={loads}
        pending={assign.isPending}
        onAssign={(userId) =>
          assign.mutate(
            { lead_ids: assigning.map((row) => row.id), assigned_to_id: userId },
            { onSuccess: () => setAssigning([]) }
          )
        }
      />

      {converting && <ConvertLeadFlow lead={converting} onDone={() => setConverting(null)} />}

      <NewLeadDrawer
        open={creating}
        setOpen={(open) => {
          setCreating(open)
          if (!open) create.reset()
        }}
        layout={layout}
        sources={sourceItems}
        preferences={preferences.map((row) => ({ value: row.id, label: row.label }))}
        assignees={staffItems}
        pending={create.isPending}
        error={create.error}
        onCreate={(lead) =>
          create.mutate(lead, {
            onSuccess: (made) => {
              setCreating(false)
              router.push(`${protectedRoutes.adminLeads.path}/${made.id}`)
            },
          })
        }
      />
    </>
  )
}
