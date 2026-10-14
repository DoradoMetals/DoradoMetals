import type { PoolClient } from 'pg'

export async function aStaleSpot(c: PoolClient, metal_id: string): Promise<void> {
  await c.query(`UPDATE spots.settings SET stale_after_seconds = 60`)
  const { rows } = await c.query(
    `DELETE FROM spots.spots WHERE metal_id = $1
     RETURNING metal_id, ask, bid, dollar_change, percent_change`,
    [metal_id]
  )
  const was = rows[0]
  await c.query(
    `INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() - interval '1 hour')`,
    [metal_id, was?.ask ?? 1, was?.bid ?? 1, was?.dollar_change ?? 0, was?.percent_change ?? 0]
  )
}
