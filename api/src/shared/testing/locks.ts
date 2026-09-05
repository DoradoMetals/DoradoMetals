export const LOCKS = {
  SCRAP_SWEEP: 4207,
  FULFILLMENTS: 4211,
  ORDERS: 4213,
  ADDRESSES: 4214,
  USERS: 4215,
}

import { appendFileSync } from 'node:fs'
import type { PoolClient } from 'pg'

const TRACE = process.env.DORADO_LOCK_TRACE ?? null

function trace(record: Record<string, unknown>): void {
  if (!TRACE) return
  try {
    appendFileSync(TRACE, `${JSON.stringify(record)}\n`)
  } catch {}
}

export async function takeLocks(
  client: PoolClient,
  locks: number | number[] | null | undefined
): Promise<void> {
  const wanted = (Array.isArray(locks) ? locks : [locks]).filter((l): l is number => Boolean(l))
  const ids = [...new Set(wanted)].sort((a, b) => a - b)
  for (const id of ids) {
    const asked = Date.now()
    await client.query('SELECT pg_advisory_xact_lock($1)', [id])
    trace({ event: 'acquired', id, file: process.argv[1], wait_ms: Date.now() - asked })
  }
  if (!TRACE || ids.length === 0) return

  const held = Date.now()
  const realQuery = client.query.bind(client)
  ;(client as unknown as { query: unknown }).query = (sql: unknown, params?: unknown[]) => {
    const text = typeof sql === 'string' ? sql.trim().toUpperCase() : ''
    if (text === 'COMMIT' || text === 'ROLLBACK') {
      for (const id of ids) {
        trace({ event: 'released', id, file: process.argv[1], hold_ms: Date.now() - held })
      }
      ;(client as unknown as { query: unknown }).query = realQuery
    }
    return realQuery(sql as never, params as never)
  }
}
