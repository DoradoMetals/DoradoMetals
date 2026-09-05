import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import type { PoolClient } from 'pg'
import { FEATURES, RENAMES, DELIBERATE, FLOWS } from '../feature-map.ts'
import type { FeatureMap } from '../feature-map.ts'

let columns: Map<string, Set<string>>
let client: PoolClient

beforeAll(async () => {
  client = await pool.connect()
  const { rows } = await client.query(
    `select table_schema, table_name, column_name
       from information_schema.columns
      where table_schema not in ('pg_catalog','information_schema')`
  )
  columns = new Map<string, Set<string>>()
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`
    if (!columns.has(key)) columns.set(key, new Set())
    columns.get(key)!.add(r.column_name)
  }
})
afterAll(async () => {
  client?.release()
})

const tablesIn = (features: FeatureMap): Set<string> => {
  const out = new Set<string>()
  for (const sources of Object.values(features)) {
    for (const [src, targets] of Object.entries(sources)) {
      out.add(src)
      for (const t of targets) out.add(t)
    }
  }
  return out
}

test('the schema was actually read, so nothing below passes on an empty map', () => {
  assert.ok(columns.size > 50, `only ${columns.size} table(s) found in the database`)
  assert.ok(columns.has('exchange.products'), 'exchange.products is missing - wrong database?')
  assert.ok(
    Object.keys(FEATURES).length >= 15,
    `only ${Object.keys(FEATURES).length} features declared`
  )
})

test('every table the map names exists', () => {
  const missing = [...tablesIn(FEATURES)].filter((t) => !columns.has(t)).sort()
  assert.deepEqual(missing, [], `the map names ${missing.length} table(s) that do not exist`)
})

test('every column a rename comes FROM exists on its source table', () => {
  const missing: string[] = []
  for (const [table, map] of Object.entries(RENAMES)) {
    const have = columns.get(table)
    if (!have) {
      missing.push(`${table} (whole table)`)
      continue
    }
    for (const from of Object.keys(map)) {
      if (!have.has(from)) missing.push(`${table}.${from}`)
    }
  }
  assert.deepEqual(missing.sort(), [], 'a rename names a source column that is not there')
})

test("every column a rename goes TO exists on one of that table's declared targets", () => {
  const targetsOf = (src: string): string[] => {
    const out = new Set<string>()
    for (const sources of Object.values(FEATURES)) {
      for (const t of sources[src] ?? []) out.add(t)
    }
    return [...out]
  }
  const missing: string[] = []
  let checked = 0
  for (const [table, map] of Object.entries(RENAMES)) {
    const targets = targetsOf(table)
    if (!targets.length) {
      missing.push(`${table} has renames but no declared target`)
      continue
    }
    for (const [from, to] of Object.entries(map)) {
      if (to === '-') continue
      checked += 1
      const found = targets.some((t) => columns.get(t)?.has(to))
      if (!found) missing.push(`${table}.${from} -> "${to}" is on none of ${targets.join(', ')}`)
    }
  }
  assert.ok(checked >= 40, `only ${checked} rename target(s) checked - the walk is broken`)
  assert.deepEqual(missing.sort(), [], 'a rename points at a column that does not exist')
})

test('every column excused as deliberate exists, or the excuse is stale', () => {
  const missing: string[] = []
  for (const key of Object.keys(DELIBERATE)) {
    const idx = key.lastIndexOf('.')
    const table = key.slice(0, idx)
    const column = key.slice(idx + 1)
    if (!columns.get(table)?.has(column)) missing.push(key)
  }
  assert.deepEqual(missing.sort(), [], 'a DELIBERATE entry excuses a column that is not there')
})

test('every table and column in a value FLOW exists on both sides', () => {
  const missing: string[] = []
  let checked = 0
  for (const sources of Object.values(FLOWS)) {
    for (const [src, targets] of Object.entries(sources)) {
      if (!columns.has(src)) {
        missing.push(`${src} (flow source)`)
        continue
      }
      for (const [target, map] of Object.entries(targets)) {
        if (!columns.has(target)) {
          missing.push(`${target} (flow target)`)
          continue
        }
        for (const [from, to] of Object.entries(map)) {
          for (const one of Array.isArray(to) ? to : [to]) {
            checked += 1
            if (!columns.get(src)!.has(from)) missing.push(`${src}.${from}`)
            if (!columns.get(target)!.has(one)) missing.push(`${target}.${one}`)
          }
        }
      }
    }
  }
  assert.ok(checked >= 5, `only ${checked} flow column(s) checked`)
  assert.deepEqual(missing.sort(), [], 'a value flow names something that is not there')
})
