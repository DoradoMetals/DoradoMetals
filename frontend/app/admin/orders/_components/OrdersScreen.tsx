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
  Pagination,
  Select,
  useDebounce,
  useMediaUp,
} from '@dorado/components'
import type { Direction, OrderListItem, OrderState as OrderStateValue } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'
import { protectedRoutes } from '@/shared/types/routes'

import { AdminTabs } from '../../_components'
import {
  useAssignees,
  useBatchOrders,
  useOrderList,
  useRefinerLocations,
  useRefinerOptions,
  useSelection,
  useSortOptions,
} from '../_api'
import {
  actionLabel,
  BATCH_ACTION,
  formatEstimate,
  formatFineOz,
  formatPurity,
  formatTotal,
  formatWeight,
  pluralize,
  sharedByAll,
} from '../_lib'
import { OrderCard } from './OrderCard'
import { OrderContextMenu } from './OrderContextMenu'
import {
  OrderFilterBar,
  purchaseStateFilters,
  saleStateFilters,
  type OrderFilterValue,
} from './OrderFilterBar'
import { OrderSearch } from './OrderSearch'
import { OrdersEmpty, OrdersFailed, OrdersSkeleton } from './OrdersStates'
import { SelectionActions } from './SelectionActions'

const PAGE_SIZE = 50

const DESCRIPTION =
  'Every purchase and sale, and the lots inside each one — what is still to place and what has settled.'

const SHOW_ITEMS = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
]

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'purchase', label: 'Purchases' },
  { value: 'sale', label: 'Sales' },
]

export function OrdersScreen() {
  const router = useRouter()
  const mobile = !useMediaUp('lg')

  const [direction, setDirection] = React.useState<Direction>('purchase')
  const [state, setState] = React.useState<OrderFilterValue>('all')
  const [show, setShow] = React.useState('all')
  const [assignee, setAssignee] = React.useState('anyone')
  const [sort, setSort] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<string[]>([])
  const [destination, setDestination] = React.useState<string | undefined>()
  const q = useDebounce(search, 300)

  const sorts = useSortOptions().data ?? []
  const employees = useAssignees().data ?? []
  const refiners = useRefinerOptions().data ?? []
  const locations = useRefinerLocations().data ?? []

  const list = useOrderList({
    direction,
    state: state === 'all' ? null : [state as OrderStateValue],
    assigned_to_id: assignee === 'anyone' ? null : assignee,
    has_unassigned_lots: show === 'unassigned' ? true : null,
    sort: sort === '' ? null : sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const batch = useBatchOrders()

  const items = list.data?.items ?? []
  const counts = list.data?.counts
  const pageCount = Math.max(1, Math.ceil((counts?.orders ?? 0) / PAGE_SIZE))
  const picked = items.filter((item) => selected.includes(item.id))
  const summary = useSelection(picked.map((item) => item.id)).data

  const clear = () => {
    setSelected([])
    setDestination(undefined)
  }

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
      clear()
    }

  const reset = () => {
    setState('all')
    setShow('all')
    setAssignee('anyone')
    setSort('')
    setSearch('')
    setPage(1)
    clear()
  }

  const countLine = counts
    ? `${pluralize(counts.orders, 'order', 'orders')} · ${pluralize(counts.unassigned_lots, 'unassigned lot', 'unassigned lots')}`
    : undefined

  const destinations = refiners.flatMap((refiner) => {
    const name = refiner.organization.name ?? 'Refiner'
    const sites = locations.filter(
      (location) => location.enabled && location.organization_id === refiner.organization.id
    )
    return sites.length === 0
      ? [{ value: `${refiner.id}|`, label: name }]
      : sites.map((site) => ({
          value: `${refiner.id}|${site.id}`,
          label: site.name ? `${name} · ${site.name}` : name,
        }))
  })

  const submit = () => {
    const chosen = destination ?? destinations[0]?.value
    if (!chosen) return
    const [refiner_id, location_id] = chosen.split('|')
    batch.mutate(
      {
        refiner_id,
        ...(location_id ? { location_id } : {}),
        order_ids: picked.map((item) => item.id),
      },
      { onSuccess: clear }
    )
  }

  const totals = summary
    ? [
        `${formatTotal(summary.estimated_value)} est.`,
        ...summary.fine_oz.map((row) => formatFineOz(row.metal_id, row.oz)),
      ].join(' · ')
    : undefined

  const selectionSummary = summary
    ? `${pluralize(summary.order_count, 'order', 'orders')} selected · ${pluralize(summary.lot_count, 'lot', 'lots')}`
    : `${pluralize(picked.length, 'order', 'orders')} selected`

  const filters = direction === 'purchase' ? purchaseStateFilters : saleStateFilters
  const current = DIRECTIONS.find((entry) => entry.value === direction)

  const card = (item: OrderListItem) => {
    const isSelected = selected.includes(item.id)
    return (
      <OrderContextMenu
        key={item.id}
        reference={item.reference}
        actions={[
          { name: 'view', label: 'View' },
          ...item.actions.map((action) => ({
            name: action.name,
            label: actionLabel(action.name),
            disabled: true,
            intent: action.name === 'cancel' ? ('danger' as const) : undefined,
          })),
        ]}
        onAction={(name) => {
          if (name === 'view') router.push(`${protectedRoutes.adminOrders.path}/${item.id}`)
        }}
      >
        <OrderCard
          layout={mobile ? 'mobile' : 'desktop'}
          reference={item.reference}
          customer={item.customer?.name ?? '—'}
          state={item.state}
          href={`${protectedRoutes.adminOrders.path}/${item.id}`}
          lots={item.lots.map((lot) => ({
            id: lot.lot_id,
            name: lot.product_name ?? lot.form,
            reference: lot.reference,
            weight: formatWeight(lot.weight, lot.unit),
            purity: formatPurity(lot.purity),
            position: lot.destination ? `on ${lot.destination}` : undefined,
          }))}
          moreCount={item.more_count}
          summary={`${pluralize(item.lot_count, 'lot', 'lots')} · ${formatEstimate(item.estimated_value)} est.`}
          date={`${item.direction === 'sale' ? 'Placed' : 'Received'} ${formatStamp(item.direction === 'sale' ? item.placed_at : item.arrived_at)}`}
          selected={isSelected}
          onSelectedChange={(next) =>
            setSelected((now) => (next ? [...now, item.id] : now.filter((id) => id !== item.id)))
          }
          selectLabel={`Select ${item.reference}`}
        />
      </OrderContextMenu>
    )
  }

  const selects = (
    <>
      <Select
        label="Show"
        items={SHOW_ITEMS}
        value={show}
        onValueChange={change(setShow)}
        className={mobile ? undefined : 'w-70'}
      />
      <Select
        label="Assigned to"
        items={[
          { value: 'anyone', label: 'Anyone' },
          { value: 'unassigned', label: 'Unassigned' },
          ...employees
            .filter((employee) => employee.enabled)
            .map((employee) => ({ value: employee.user_id, label: employee.name })),
        ]}
        value={assignee}
        onValueChange={change(setAssignee)}
        className={mobile ? undefined : 'w-45'}
      />
      <Select
        label="Sort by"
        items={sorts.map((entry) => ({ value: entry.key, label: entry.label }))}
        value={sort || sorts[0]?.key}
        onValueChange={change(setSort)}
        className={mobile ? undefined : 'w-45'}
      />
    </>
  )

  return (
    <>
      <AdminHeader
        title="Orders & Lots"
        layout={mobile ? 'mobile' : 'desktop'}
        nav={<AdminTabs active="orders" />}
        breadcrumb={
          mobile ? undefined : (
            <Breadcrumb
              linkComponent={NextLink}
              items={[
                { label: 'Admin', href: protectedRoutes.admin.path },
                { label: 'Orders', href: protectedRoutes.adminOrders.path },
                { label: current?.label },
              ]}
            />
          )
        }
        chips={DIRECTIONS.map((entry) => (
          <Chip
            key={entry.value}
            label={entry.label}
            selected={entry.value === direction}
            aria-current={entry.value === direction ? 'page' : undefined}
            onClick={() => {
              setDirection(entry.value)
              setState('all')
              setPage(1)
              clear()
            }}
          />
        ))}
        description={mobile ? countLine : DESCRIPTION}
        search={<OrderSearch value={search} onValueChange={setSearch} q={q} mobile={mobile} />}
        selects={selects}
        reset={
          mobile ? (
            <div className="flex w-full items-center justify-between gap-sm">
              <p className="text-micro text-muted-foreground">{countLine}</p>
              <Button variant="tertiary" size="sm" onClick={reset}>
                Reset
              </Button>
            </div>
          ) : (
            <Button variant="tertiary" size="sm" onClick={reset}>
              Reset
            </Button>
          )
        }
        count={countLine}
      />

      <OrderFilterBar
        chips={filters}
        value={state}
        onValueChange={change(setState)}
        className={
          mobile ? 'flex-nowrap overflow-x-auto [&>*]:shrink-0 [&>*]:whitespace-nowrap' : undefined
        }
      />

      {list.isError ? (
        <OrdersFailed onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <OrdersSkeleton count={mobile ? 2 : 4} />
      ) : items.length === 0 ? (
        <OrdersEmpty />
      ) : (
        <div className="grid grid-cols-1 gap-md lg:auto-rows-fr lg:grid-cols-4">
          {items.map(card)}
        </div>
      )}

      {pageCount > 1 && (
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => {
            setPage(next)
            clear()
          }}
          className="self-center"
        />
      )}

      {batch.isError && (
        <Alert intent="danger" title="Couldn't batch these orders">
          Check the selection, then try again.
        </Alert>
      )}

      {picked.length > 0 && (
        <div className="sticky bottom-0 z-10 lg:bottom-md">
          <SelectionActions
            layout={mobile ? 'mobile' : 'desktop'}
            summary={selectionSummary}
            totals={totals}
            onDismiss={mobile ? undefined : clear}
            actions={[
              {
                name: BATCH_ACTION,
                label: mobile ? 'Send to' : 'Batch into',
                submitLabel: 'Batch',
                items: destinations,
                value: destination ?? destinations[0]?.value,
                onValueChange: setDestination,
                onSubmit: submit,
                enabled: sharedByAll(
                  picked.map((item) => item.actions),
                  BATCH_ACTION
                ),
                reason: 'Every selected order must offer Assign lots.',
                pending: batch.isPending,
              },
            ]}
          />
        </div>
      )}
    </>
  )
}
