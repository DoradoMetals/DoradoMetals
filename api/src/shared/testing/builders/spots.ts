import type { PoolClient } from 'pg'

export async function aStaleSpot(c: PoolClient, metal_id: string): Promise<void> {
  await c.query(`UPDATE spots.settings SET stale_after_seconds = 60`)
  const { rowCount } = await c.query(
    `UPDATE spots.current SET seen_at = now() - interval '1 hour'
      WHERE metal_id = $1 AND source_id = 'nfusion'`,
    [metal_id]
  )
  if (!rowCount) {
    await c.query(
      `INSERT INTO spots.current (source_id, metal_id, bid, ask, dollar_change, percent_change, at, seen_at)
       VALUES ('nfusion', $1, 1, 1, 0, 0, now() - interval '1 hour', now() - interval '1 hour')`,
      [metal_id]
    )
  }
}
