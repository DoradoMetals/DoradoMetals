import { SpotPrice } from "@/types/metal"

export default function getScrapPrice(content: number, premium: number, spot?: SpotPrice): number {
  if (!spot || !content || !premium) return 0
  return content * (spot.bid_spot * premium)
}