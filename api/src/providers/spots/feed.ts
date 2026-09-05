import axios from 'axios'
import type { SpotPatch } from '@dorado/contracts'

export async function fetchQuotes(): Promise<Map<string, SpotPatch>> {
  const response = await axios.get(process.env.SPOT_API_URL as string, {
    headers: { Accept: 'application/json', 'User-Agent': 'DoradoMetalsExchange/1.0' },
  })

  const quotes = new Map<string, SpotPatch>()
  for (const metal of response.data) {
    const name = metal.data?.symbol?.trim()
    const bid = metal.data?.bid
    const ask = metal.data?.ask
    if (!name || bid == null || ask == null) continue
    quotes.set(name, {
      ask: Number(ask.toFixed(2)),
      bid: Number(bid.toFixed(2)),
      percent_change: Number(metal.data?.oneDayPercentChange?.toFixed(2) ?? 0),
      dollar_change: Number(metal.data?.oneDayChange?.toFixed(2) ?? 0),
    })
  }
  return quotes
}
