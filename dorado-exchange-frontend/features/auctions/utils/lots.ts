import { AuctionCurrentLotState, AuctionItem } from "@/features/auctions/types"

export function computeCurrentLotStateFromItems(
  prev: AuctionCurrentLotState | undefined,
  items: AuctionItem[] | undefined,
  nextCurrentId: string | null
): AuctionCurrentLotState {
  const base: AuctionCurrentLotState =
    prev ??
    ({
      auction_id: '',
      current_item_id: null,
      prev_item_id: null,
      next_item_id: null,
      id: null,
      number: null,
      bullion_id: null,
      sold: null,
      starting_bid: null,
      ending_bid: null,
      quantity: null,
      buyer_email: null,
      buyer_name: null,
      bullion: null,
    } as any)

  const list = (items ?? []).slice().sort((a, b) => {
    const na = Number(a.number ?? 0)
    const nb = Number(b.number ?? 0)
    if (na !== nb) return na - nb
    return String(a.id).localeCompare(String(b.id))
  })

  const idx = nextCurrentId ? list.findIndex((x) => x.id === nextCurrentId) : -1
  const cur = idx >= 0 ? list[idx] : null
  const prevItem = idx > 0 ? list[idx - 1] : null
  const nextItem = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null

  return {
    ...base,
    current_item_id: nextCurrentId,
    prev_item_id: prevItem?.id ?? null,
    next_item_id: nextItem?.id ?? null,

    // current item snapshot (nullable)
    id: cur?.id ?? null,
    number: (cur as any)?.number ?? null,
    bullion_id: (cur as any)?.bullion_id ?? null,
    sold: (cur as any)?.sold ?? null,
    starting_bid: (cur as any)?.starting_bid ?? null,
    ending_bid: (cur as any)?.ending_bid ?? null,
    quantity: (cur as any)?.quantity ?? null,
    buyer_email: (cur as any)?.buyer_email ?? null,
    buyer_name: (cur as any)?.buyer_name ?? null,
    bullion: (cur as any)?.bullion ?? null,
  }
}
