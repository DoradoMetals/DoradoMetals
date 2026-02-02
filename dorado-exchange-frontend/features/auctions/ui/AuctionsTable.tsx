'use client'
import { useMemo, useState } from 'react'

import { ColumnDef, Row } from '@tanstack/react-table'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { TextColumn, ChipColumn } from '@/shared/ui/table/Columns'
import { DataTable } from '@/shared/ui/table/Table'
import { CreateConfig } from '@/shared/ui/table/Create'

import { useAllAuctionItems, useAuctions, useCreateAuction } from '@/features/auctions/queries'
import { getAuctionStatusMeta, type Auction, type AuctionItem } from '@/features/auctions/types'
import AuctionsDrawer from '@/features/auctions/ui/AuctionsDrawer'

function formatDateTime(value: any) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

type AuctionWithStats = Auction & {
  item_count: number
  earnings: number
}

export default function AuctionsPage() {
  const { data: auctions = [] } = useAuctions()
  const { data: allItems = [] } = useAllAuctionItems()

  const createAuction = useCreateAuction()
  const { openDrawer } = useDrawerStore()
  const [activeAuction, setActiveAuction] = useState<string | null>(null)

  const auctionsWithStats = useMemo(() => {
    const byAuction: Record<string, AuctionItem[]> = {}

    function toNumber(v: any, fallback = 0) {
      const n = typeof v === 'string' ? Number(v) : Number(v ?? fallback)
      return Number.isFinite(n) ? n : fallback
    }

    for (const item of allItems) {
      if (!item.auction_id) continue
      ;(byAuction[item.auction_id] ??= []).push(item)
    }

    return auctions.map((a) => {
      const items = byAuction[a.id] ?? []

      const item_count = items.length

      const earnings = items.reduce((sum, it) => {
        const finalBid = toNumber(it.ending_bid)
        const qty = toNumber(it.quantity, 1)
        return sum + finalBid * qty
      }, 0)

      return {
        ...a,
        item_count,
        earnings,
      }
    })
  }, [auctions, allItems])

  const nextAuctionNumber = (auctions?.reduce((m, a) => Math.max(m, a.number ?? 0), 0) ?? 0) + 1

  const columns: ColumnDef<AuctionWithStats>[] = useMemo(
    () => [
      TextColumn<AuctionWithStats>({
        id: 'number',
        header: 'Auction',
        accessorKey: 'number',
        enableHiding: false,
        size: 220,
        textClassName: 'font-medium text-neutral-900',
        formatValue: (value) => `Auction #${String(value ?? '')}`,
      }),
      ChipColumn<AuctionWithStats>({
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        align: 'center',
        enableHiding: true,
        size: 150,
        getChip: ({ row }) => {
          const meta = getAuctionStatusMeta(row.status)
          return {
            label: meta.label,
            className: meta.chip,
          }
        },
      }),
      TextColumn<AuctionWithStats & { item_count: number }>({
        id: 'item_count',
        header: 'Number of Lots',
        accessorKey: 'item_count',
        align: 'center',
        size: 110,
        textClassName: 'tabular-nums',
      }),

      TextColumn<AuctionWithStats & { earnings: number }>({
        id: 'earnings',
        header: 'Earnings',
        accessorKey: 'earnings',
        align: 'center',
        size: 150,
        textClassName: 'tabular-nums font-medium',
        formatValue: (v) =>
          Number(v).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          }),
      }),
      TextColumn<AuctionWithStats>({
        id: 'scheduled_date',
        header: 'Scheduled',
        accessorKey: 'scheduled_date',
        enableHiding: true,
        size: 240,
        textClassName: 'text-xs sm:text-sm text-neutral-900',
        formatValue: (v) => (v ? formatDateTime(v) : ''),
      }),
    ],
    []
  )

  const createConfig: CreateConfig = {
    title: `Create Auction #${nextAuctionNumber}`,
    submitLabel: `Create Auction #${nextAuctionNumber}`,
    fields: [],

    createNew: async () => {
      await createAuction.mutateAsync({
        status: 'draft',
        scheduled_date: null,
      })
    },

    canSubmit: () => !createAuction.isPending,
  }

  const handleRowClick = (row: Row<Auction>) => {
    setActiveAuction(row.original.id)
    openDrawer('auctions')
  }

  return (
    <>
      <DataTable<AuctionWithStats>
        data={auctionsWithStats}
        columns={columns}
        initialPageSize={12}
        searchColumnId="number"
        searchPlaceholder="Search auctions..."
        enableColumnVisibility
        wrapperClassName="glass-card"
        shadowClass=""
        showCardBackground={false}
        onRowClick={handleRowClick}
        getRowClassName={() => 'hover:bg-background hover:cursor-pointer'}
        createConfig={createConfig}
      />

      {activeAuction && <AuctionsDrawer auction_id={activeAuction} auctions={auctions} />}
    </>
  )
}
