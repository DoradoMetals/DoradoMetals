import { AdminProduct } from "@/features/products/types"

export const AUCTION_STATUSES = ['draft', 'scheduled', 'live', 'completed'] as const

export type KnownAuctionStatus = (typeof AUCTION_STATUSES)[number]
export type AuctionStatus = KnownAuctionStatus

export type Auction = {
  id: string
  status: AuctionStatus
  scheduled_date: string | null
  number: number

  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type AuctionItem = {
  id: string
  auction_id: string
  bullion_id: string
  bullion?: AdminProduct
  number: number
  buyer_email: string | null
  buyer_name: string | null
  sold: boolean
  starting_bid: string | null
  ending_bid: string | null
  quantity: string | null
}

export type CreateAuctionInput = {
  status?: AuctionStatus
  scheduled_date?: string | null
}

export type UpdateAuctionInput = {
  id: string
  status?: AuctionStatus
  scheduled_date?: string | null
}

export type CreateAuctionItemInput = {
  auction_id: string
  bullion_id: string

  buyer_email?: string | null
  buyer_name?: string | null
  sold?: boolean

  starting_bid?: string | number | null
  ending_bid?: string | number | null
  quantity?: string | number | null

  number?: number | null
}

export type CreateAuctionLotsInput = {
  bullion_id: string
  quantity_per_lot: string | number | null
  lot_count: number
  starting_bid: string | number | null
}

export type UpdateAuctionItemInput = {
  id: string
  buyer_email?: string | null
  buyer_name?: string | null
  sold?: boolean
  starting_bid?: string | number | null
  ending_bid?: string | number | null
  quantity?: string | number | null
}

export const AUCTION_STATUS_META: Record<
  AuctionStatus,
  { label: string; chip: string }
> = {
  draft: { label: 'Draft', chip: 'destructive-on-glass' },
  scheduled: { label: 'Scheduled', chip: 'secondary-on-glass' },
  live: { label: 'Live', chip: 'primary-on-glass' },
  completed: { label: 'Completed', chip: 'success-on-glass' },
}

export function isAuctionStatus(v: unknown): v is AuctionStatus {
  return typeof v === 'string' && (AUCTION_STATUSES as readonly string[]).includes(v.toLowerCase())
}

export function coerceAuctionStatus(v: unknown): AuctionStatus {
  if (typeof v === 'string') {
    const s = v.toLowerCase()
    if ((AUCTION_STATUSES as readonly string[]).includes(s)) return s as AuctionStatus
  }
  return 'draft'
}

export function getAuctionStatusMeta(status?: unknown) {
  return AUCTION_STATUS_META[coerceAuctionStatus(status)]
}
