// The spot feature's pure rules. No database, no HTTP.
import type { SpotPrice, SpotTicker, SpotTrend } from "@dorado/contracts";

// WHICH WAY THE METAL MOVED TODAY. Said here once instead of by every ticker:
// two of them read `(dollar_change ?? 0) >= 0` and painted a flat day green.
export const trendOf = (change: number | null): SpotTrend =>
  change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";

export const ticker = (rows: SpotPrice[]): SpotTicker[] =>
  rows.map((row) => ({ ...row, direction: trendOf(row.dollar_change) }));
