'use client'

import { useMemo } from 'react'
import { ColumnDef } from '@tanstack/react-table'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { cn } from '@/shared/utils/cn'
import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, ChipColumn, SelectionColumn } from '@/shared/ui/table/Columns'

import {
  AUCTION_STATUSES,
  AUCTION_STATUS_META,
  coerceAuctionStatus,
  Auction,
  AuctionItem,
  AuctionStatus,
} from '@/features/auctions/types'

import {
  useAuctionItems,
  useUpdateAuction,
  useUpdateAuctionItem,
  useCreateAuctionLots,
  useDeleteAuctionItems,
  useAuctionCurrentLot,
  useNextAuctionCurrentLot,
  usePrevAuctionCurrentLot,
  useSetAuctionCurrentLot,
} from '@/features/auctions/queries'
import SchedulePicker from '@/features/auctions/ui/SchedulePicker'
import { useAdminProducts } from '@/features/products/queries'
import { BullionSearchSelect } from '@/features/auctions/ui/BullionSearchSelect'
import { useSpotPrices } from '@/features/spots/queries'
import QuantityBar from '@/features/products/ui/QuantityInput'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { calcStartingBidPerLot } from '@/features/auctions/utils/calc'
import { DisplayToggle } from '@/shared/ui/DisplayToggle'
import { CreateConfig } from '@/shared/ui/table/CreateDialog'
import { GroupColumnSpec } from '@/shared/ui/table/RowGroups'
import { LotCard } from '@/features/auctions/ui/LotCard'

export default function AuctionsDrawer({
  auctions,
  auction_id,
}: {
  auctions: Auction[]
  auction_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'auctions'

  const auction = useMemo(() => auctions.find((a) => a.id === auction_id), [auctions, auction_id])

  if (!auction) return null

  return (
    <Drawer
      open={isDrawerOpen}
      setOpen={closeDrawer}
      className="glass-panel w-full sm:min-w-1/2 md:min-w-1/2 lg:min-w-3/5 xl:min-w-2/5"
    >
      <Header auction={auction} />
      <div className="glass-divider" />
      <div className="space-y-8">
        <StatusSection auction={auction} />
        <div className="glass-divider" />
        <CurrentLotControls auction={auction} />
        <div className="glass-divider" />
        <Items auction={auction} />
        <div className="glass-divider" />
      </div>
    </Drawer>
  )
}

function Header({ auction }: { auction: Auction }) {
  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="text-xl text-neutral-900">Auction #{auction.number}</div>
        </div>
      </div>
    </div>
  )
}

function StatusRadioGroup({
  value,
  onChange,
}: {
  value: AuctionStatus
  onChange: (v: AuctionStatus) => void
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 w-full gap-2">
      {AUCTION_STATUSES.map((s) => {
        const active = value === s
        const meta = AUCTION_STATUS_META[s]

        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              'cursor-pointer flex-1 px-3 py-2 text-sm font-semibold transition-colors',
              'rounded-lg',
              active ? meta.chip : 'on-glass text-neutral-600 hover:text-neutral-900'
            )}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

function StatusSection({ auction }: { auction: Auction }) {
  const updateAuction = useUpdateAuction()

  const handleUpdate = (patch: Partial<Auction>) => {
    updateAuction.mutate({ id: auction.id, ...patch })
  }

  const value = coerceAuctionStatus(auction.status)

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="section-label">Status and Schedule</div>

      <StatusRadioGroup
        value={value}
        onChange={(next) => {
          handleUpdate({ status: next })
        }}
      />

      <SchedulePicker
        value={auction.scheduled_date}
        minDate={new Date()}
        onChange={(iso) => {
          handleUpdate({ scheduled_date: iso })
        }}
      />
    </div>
  )
}

function StatPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="text-xs text-neutral-700">{label}</div>
      <div className={cn('text-2xl text-neutral-900')}>{children}</div>
    </div>
  )
}



function LotSlotPlaceholder() {
  return (
    <div aria-hidden className="w-full rounded-2xl p-3 opacity-0 pointer-events-none select-none">
      <div className="h-1" />
    </div>
  )
}

function CurrentLotControls({ auction }: { auction: Auction }) {
  const { data } = useAuctionCurrentLot(auction.id)
  const { data: items = [] } = useAuctionItems(auction.id)

  const next = useNextAuctionCurrentLot(auction.id)
  const prev = usePrevAuctionCurrentLot(auction.id)
  const setCurrent = useSetAuctionCurrentLot(auction.id)

  const isBusy = next.isPending || prev.isPending || setCurrent.isPending

  const currentId = data?.current_item_id ?? null
  const prevId = data?.prev_item_id ?? null
  const nextId = data?.next_item_id ?? null

  const prevItem = prevId ? items.find((x) => x.id === prevId) : null
  const nextItem = nextId ? items.find((x) => x.id === nextId) : null

  const currentItem =
    (currentId
      ? {
          id: currentId,
          number: data?.number ?? null,
          bullion_id: (data as any)?.bullion_id ?? null,
          bullion: (data as any)?.bullion ?? null,
          starting_bid: (data as any)?.starting_bid ?? null,
        }
      : null) ?? (currentId ? items.find((x) => x.id === currentId) : null)

  return (
    <div className="space-y-3">
      <div className="section-label">Current Lot</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {prevItem ? (
          <LotCard
            kind='past'
            label="Previous"
            item={prevItem}
            disabled={isBusy}
            onClick={async () => {
              if (isBusy) return
              await prev.mutateAsync()
            }}
          />
        ) : (
          <LotSlotPlaceholder />
        )}

        <LotCard
          kind='current'
          label="Current"
          item={currentItem}
          disabled={isBusy || !currentItem}
        />

        {nextItem ? (
          <LotCard
            kind='future'
            label="Next"
            item={nextItem}
            disabled={isBusy}
            onClick={async () => {
              if (isBusy) return
              await next.mutateAsync()
            }}
          />
        ) : (
          <LotSlotPlaceholder />
        )}
      </div>
    </div>
  )
}

function Items({ auction }: { auction: Auction }) {
  const { data: items = [] } = useAuctionItems(auction.id)
  const { data: bullion = [] } = useAdminProducts()
  const createLots = useCreateAuctionLots(auction.id)
  const updateItem = useUpdateAuctionItem(auction.id)
  const deleteMany = useDeleteAuctionItems(auction.id)
  const { data: spotPrices = [] } = useSpotPrices()
  const isMutating = createLots.isPending || updateItem.isPending || deleteMany.isPending

  const getInt = (v: string | undefined, fallback = 0) => {
    const n = Number((v ?? '').trim())
    return Number.isFinite(n) ? Math.trunc(n) : fallback
  }

  const getBool = (v: string | undefined, fallback = false) => {
    const s = (v ?? '').trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off') return false
    return fallback
  }

  const createConfig: CreateConfig = {
    title: 'Add Lots',
    submitLabel: 'Add Lots',
    fields: [
      {
        name: 'bullion_id',
        label: 'Bullion',
        render: ({ value, setValue }) => (
          <BullionSearchSelect
            value={value || null}
            products={bullion}
            onChange={(id) => setValue('bullion_id', id)}
            placeholder="Search bullion..."
          />
        ),
      },

      {
        name: 'qty_row',
        label: '',
        render: ({ values, setValue }) => (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <QuantityBar
                label="Per Lot"
                value={getInt(values.quantity_per_lot, 1)}
                min={1}
                step={1}
                onChange={(n) => setValue('quantity_per_lot', String(n))}
                inputClassName="on-glass"
                buttonClassName="on-glass hover:on-glass"
              />
            </div>

            <div className="flex flex-col gap-1">
              <QuantityBar
                label="Amount of Lots"
                value={getInt(values.lot_count, 1)}
                min={1}
                step={1}
                onChange={(n) => setValue('lot_count', String(n))}
                inputClassName="on-glass"
                buttonClassName="on-glass hover:on-glass"
              />
            </div>
          </div>
        ),
      },

      {
        name: 'toggles_row',
        label: '',
        render: ({ values, setValue }) => {
          const usePremium = getBool(values.calcWithPremium, true)
          const useFee = getBool(values.usePlatformFee, true)

          return (
            <div className="grid grid-cols-2 gap-3">
              <DisplayToggle
                label="Use Ask Premium"
                value={usePremium}
                onChange={(next) => setValue('calcWithPremium', String(next))}
                onLabel="Yes"
                offLabel="No"
                onClass="success-on-glass rounded-l-lg"
                offClass="destructive-on-glass rounded-r-lg"
                inactiveClass="on-glass"
                groupClassName="rounded-none"
              />

              <DisplayToggle
                label="Use Platform Fee"
                value={useFee}
                onChange={(next) => setValue('usePlatformFee', String(next))}
                onLabel="Yes"
                offLabel="No"
                onClass="success-on-glass rounded-l-lg"
                offClass="destructive-on-glass rounded-r-lg"
                inactiveClass="on-glass"
                groupClassName="rounded-none"
              />
            </div>
          )
        },
      },

      {
        name: 'summary_row',
        label: '',
        render: ({ values, setValue }) => {
          const bullion_id = (values.bullion_id ?? '').trim()
          const p = bullion.find((x) => x.id === bullion_id)

          const spot = p ? spotPrices.find((s) => s.type === p.metal) : null
          const qty = getInt(values.quantity_per_lot, 0)
          const lots = getInt(values.lot_count, 0)

          const usePremium = getBool(values.calcWithPremium, true)
          const useFee = getBool(values.usePlatformFee, true)

          const premium = usePremium ? (p?.ask_premium ?? 0) : 1
          const feeRate = useFee ? 0.08 : 0

          const starting = calcStartingBidPerLot({
            ask: spot?.ask_spot ?? 0,
            content: p?.content ?? 0,
            premium,
            qtyPerLot: qty,
            feeRate,
          })

          const startingStr = starting > 0 ? String(starting) : ''

          if ((values.starting_bid ?? '') !== startingStr) {
            setValue('starting_bid', startingStr)
          }

          const total = qty * lots

          return (
            <div className="grid grid-cols-2 gap-3">
              <StatPill label="Starting Bid">
                {starting > 0 ? (
                  <PriceNumberFlow value={starting} />
                ) : (
                  <span className="text-neutral-500 font-medium">—</span>
                )}
              </StatPill>

              <StatPill label="Total Units">
                {total > 0 ? (
                  <span>{total}</span>
                ) : (
                  <span className="text-neutral-500 font-medium">—</span>
                )}
              </StatPill>
            </div>
          )
        },
      },
    ],

    createNew: async (values) => {
      if (isMutating) return

      const bullion_id = (values.bullion_id ?? '').trim()
      const qty = getInt(values.quantity_per_lot, 0)
      const lots = getInt(values.lot_count, 0)

      const starting_bid = (values.starting_bid ?? '').trim()

      await createLots.mutateAsync({
        bullion_id,
        quantity_per_lot: qty > 0 ? String(qty) : null,
        lot_count: lots,
        starting_bid: starting_bid.length ? starting_bid : null,
      })
    },

    canSubmit: (values) => {
      if (isMutating) return false
      const bullion_id = (values.bullion_id ?? '').trim()
      const qty = getInt(values.quantity_per_lot, 0)
      const lots = getInt(values.lot_count, 0)
      return bullion_id.length > 0 && qty >= 1 && lots >= 1
    },
  }

  const columns: ColumnDef<AuctionItem>[] = [
    SelectionColumn<AuctionItem>(),
    TextColumn<AuctionItem>({
      id: 'number',
      header: 'Lot #',
      accessorKey: 'number',
      enableHiding: false,
      align: 'center',
      formatValue: (v) => (v == null || v === '' ? '—' : `#${v}`),
    }),

    TextColumn<AuctionItem>({
      id: 'bullion',
      header: 'Bullion',
      accessorKey: 'bullion_id',
      enableGrouping: true,
      enableHiding: true,
      textClassName: 'text-xs sm:text-sm text-neutral-900',
      formatValue: (_v, row) => row.bullion?.product_name ?? row.bullion_id,

      filterFnOverride: (row, _columnId, filterValue) => {
        const q = String(filterValue ?? '')
          .toLowerCase()
          .trim()
        if (!q) return true

        const original = row.original as AuctionItem
        const name = (original.bullion?.product_name ?? '').toLowerCase()
        const id = (original.bullion_id ?? '').toLowerCase()

        return name.includes(q) || id.includes(q)
      },
    }),

    TextColumn<AuctionItem>({
      id: 'quantity',
      header: 'Qty',
      accessorKey: 'quantity',
      enableHiding: true,
      align: 'center',
      textClassName: 'text-xs sm:text-sm text-neutral-900',
    }),

    TextColumn<AuctionItem>({
      id: 'starting_bid',
      header: 'Start',
      accessorKey: 'starting_bid',
      enableHiding: true,
      align: 'center',
      formatValue: (v) => (v == null || v === '' ? '—' : `$${v}`),
    }),

    TextColumn<AuctionItem>({
      id: 'ending_bid',
      header: 'End',
      accessorKey: 'ending_bid',
      enableHiding: true,
      align: 'center',
      formatValue: (v) => (v == null || v === '' ? '—' : `$${v}`),
    }),

    ChipColumn<AuctionItem>({
      id: 'sold',
      header: 'Sold',
      accessorKey: 'sold',
      align: 'center',
      enableHiding: true,
      getChip: ({ row }) => {
        const item = row as AuctionItem
        const sold = !!item.sold
        return {
          label: sold ? 'Sold' : 'Unsold',
          className: sold ? 'success-on-glass' : 'destructive-on-glass',
        }
      },
    }),
  ]

  const groupSpec: GroupColumnSpec<AuctionItem>[] = [{ id: 'bullion', kind: { type: 'label' } }]

  return (
    <div className="space-y-3">
      <div className="section-label h-full">Items</div>
      <DataTable<AuctionItem>
        data={items}
        columns={columns}
        initialPageSize={10}
        showCardBackground={false}
        hidePagination={true}
        searchColumnId="bullion"
        searchPlaceholder="Search items..."
        enableColumnVisibility
        enableRowSelection
        getRowId={(row) => row.id}
        showSelectionBar
        selectionReplaceTopRow={false}
        selectionShowDelete
        onSelectionDelete={async (ids) => {
          if (isMutating) return
          await deleteMany.mutateAsync({ item_ids: ids })
        }}
        searchClass="on-glass"
        shadowClass="shadow-none"
        wrapperClassName="flex flex-col w-full h-full min-h-0 p-1 on-glass"
        columnTriggerClass="on-glass"
        addButtonClass="on-glass"
        showHeaders
        getRowClassName={(row) =>
          row.getIsSelected() ? 'bg-neutral-900/5 ring-1 ring-primary/25' : 'hover:cursor-default'
        }
        createConfig={createConfig}
        enableGrouping
        initialGrouping={['bullion']}
        groupSpec={groupSpec}
        selectionDeleteButtonClassName="destructive-on-glass"
      />
    </div>
  )
}
