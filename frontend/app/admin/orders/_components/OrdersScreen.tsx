'use client'

import NextLink from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
import { OrderState, type Direction, type OrderListItem } from '@dorado/contracts'

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
  useListSummary,
  useSortOptions,
} from '../_api'
import {
  actionLabel,
  BATCH_ACTION,
  chooseShow,
  chooseState,
  formatEstimate,
  formatFineOz,
  formatPurity,
  formatTotal,
  formatWeight,
  pluralize,
  requestStates,
  sharedByAll,
  summaryLine,
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

const PAGE_SIZE = 24

const SHOW_ITEMS = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
]

const SHOW_VALUES = SHOW_ITEMS.map((entry) => entry.value)
const STATE_VALUES: string[] = OrderState.options

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'purchase', label: 'Purchases' },
  { value: 'sale', label: 'Sales' },
]

// The URL's state and show, made consistent: a closed-state chip widens Show.
export function fromParams(params: { get(name: string): string | null }) {
  const s = params.get('state')
  const w = params.get('show')
  const state: OrderFilterValue = s && STATE_VALUES.includes(s) ? (s as OrderFilterValue) : 'all'
  const show = w && SHOW_VALUES.includes(w) ? w : 'in_progress'
  const scope = { state, show }
  return state === 'all' ? chooseShow(scope, show) : chooseState(scope, state)
}

export function OrdersScreen() {
  const router = useRouter()
  const mobile = !useMediaUp('lg')

  const pathname = usePathname()
  const params = useSearchParams()

  const [direction, setDirection] = React.useState<Direction>(() =>
    params.get('direction') === 'sale' ? 'sale' : 'purchase'
  )
  const [initial] = React.useState(() => fromParams(params))
  const [state, setState] = React.useState<OrderFilterValue>(initial.state)
  const [show, setShow] = React.useState(initial.show)
  const [assignee, setAssignee] = React.useState('anyone')
  const [sort, setSort] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(() => {
    const value = Number(params.get('page'))
    return Number.isInteger(value) && value > 0 ? value : 1
  })
  const [barHeight, setBarHeight] = React.useState(0)
  const barRef = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = React.useState<string[]>([])
  const [destination, setDestination] = React.useState<string | undefined>()
  const q = useDebounce(search, 300)

  const sorts = useSortOptions().data ?? []
  const employees = useAssignees().data ?? []
  const refiners = useRefinerOptions().data ?? []
  const locations = useRefinerLocations().data ?? []

  React.useEffect(() => {
    const next = new URLSearchParams()
    if (direction !== 'purchase') next.set('direction', direction)
    if (state !== 'all') next.set('state', state)
    if (show !== 'in_progress') next.set('show', show)
    if (page > 1) next.set('page', String(page))
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [direction, state, show, page, pathname, router])

  const list = useOrderList({
    direction,
    state: requestStates({ state, show }),
    assigned_to_id: assignee === 'anyone' ? null : assignee,
    has_unassigned_lots: show === 'unassigned' ? true : null,
    sort: sort === '' ? null : sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    q: q.trim() === '' ? null : q.trim(),
  })
  const batch = useBatchOrders()

  const items = list.data?.items ?? []
  const counts = list.data?.counts
  const pageCount = Math.max(1, Math.ceil((counts?.orders ?? 0) / PAGE_SIZE))
  const picked = items.filter((item) => selected.includes(item.id))
  const barOpen = picked.length > 0

  React.useLayoutEffect(() => {
    const node = barRef.current
    if (!barOpen || !node) {
      setBarHeight(0)
      return
    }
    const measure = () => setBarHeight(node.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [barOpen, mobile])
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
    setShow('in_progress')
    setAssignee('anyone')
    setSort('')
    setSearch('')
    setPage(1)
    clear()
  }

  const totalsData = useListSummary(direction).data
  const totalsLine = totalsData ? summaryLine(direction, totalsData) : undefined
  const matching = counts ? `${counts.orders} matching` : undefined

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
        onValueChange={change((value: string) => {
          const next = chooseShow({ state, show }, value)
          setShow(next.show)
          setState(next.state)
        })}
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
        description={totalsLine}
        search={<OrderSearch value={search} onValueChange={setSearch} q={q} mobile={mobile} />}
        selects={selects}
        reset={
          <Button variant="tertiary" size="sm" onClick={reset}>
            Reset
          </Button>
        }
        count={matching}
      />

      <OrderFilterBar
        chips={filters}
        value={state}
        onValueChange={change((value: OrderFilterValue) => {
          const next = chooseState({ state, show }, value)
          setState(next.state)
          setShow(next.show)
        })}
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

      <Pagination
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        onPageChange={(next) => {
          setPage(next)
          clear()
        }}
        className="self-center"
      />

      {batch.isError && (
        <Alert intent="danger" title="Couldn't batch these orders">
          Check the selection, then try again.
        </Alert>
      )}

      {barOpen && <div aria-hidden style={{ height: barHeight }} />}

      {barOpen && (
        <>
          <SelectionActions
            ref={barRef}
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
        </>
      )}
    </>
  )
}
