import pool from '#pool'
import { takeLocks } from '#shared/testing/locks.ts'
import { TEST_ACTOR, actingAs } from '#shared/testing/actor.ts'
import type { PoolClient, QueryResult } from 'pg'

const patchable = pool as unknown as {
  connect: () => Promise<PoolClient>
  query: (sql: unknown, params?: unknown[]) => Promise<QueryResult>
}

const REAL = {
  connect: pool.connect.bind(pool),
  query: pool.query.bind(pool),
}

let depth = 0

function nestable(client: PoolClient): PoolClient {
  const realQuery = client.query.bind(client)

  return new Proxy(client, {
    get(target: PoolClient, prop: string | symbol) {
      if (prop === 'query') {
        return async (sql: unknown, params?: unknown[]) => {
          const text = typeof sql === 'string' ? sql.trim().toUpperCase() : ''

          if (text === 'BEGIN') {
            depth += 1
            return realQuery(`SAVEPOINT nested_${depth}`)
          }
          if (text === 'COMMIT') {
            const at = depth
            depth = Math.max(0, depth - 1)
            return realQuery(`RELEASE SAVEPOINT nested_${at}`)
          }
          if (text === 'ROLLBACK') {
            const at = depth
            depth = Math.max(0, depth - 1)
            return realQuery(`ROLLBACK TO SAVEPOINT nested_${at}`)
          }
          return realQuery(sql as never, params as never)
        }
      }
      if (prop === 'release') return () => {}
      const value = (target as unknown as Record<string | symbol, unknown>)[prop]
      if (typeof value === 'function') return (value as (...a: unknown[]) => unknown).bind(target)
      return value
    },
  })
}

export async function inPinnedTransaction<T>(
  fn: (client: PoolClient) => Promise<T> | T,
  { lock, actor = TEST_ACTOR.id }: { lock?: number | number[]; actor?: string | null } = {}
): Promise<T> {
  const client = await REAL.connect()
  const pinned = nestable(client)
  depth = 0

  await client.query('BEGIN')
  await actingAs(client, actor)
  if (lock) await takeLocks(client, lock)
  patchable.connect = async () => pinned
  patchable.query = (sql, params) => pinned.query(sql as never, params as never)

  try {
    return await fn(pinned)
  } finally {
    patchable.connect = REAL.connect
    patchable.query = REAL.query
    await client.query('ROLLBACK')
    client.release()
  }
}

export async function outside<T = Record<string, any>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await REAL.connect()
  try {
    const { rows } = await client.query(sql, params)
    return rows as T[]
  } finally {
    client.release()
  }
}

export async function assertNothingEscaped(
  table: string,
  predicate: string,
  params: unknown[] = []
): Promise<number> {
  const outside = await REAL.connect()
  try {
    const { rows } = await outside.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${predicate}`,
      params
    )
    return rows[0].n
  } finally {
    outside.release()
  }
}
