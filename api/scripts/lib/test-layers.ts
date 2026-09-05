import fs from 'node:fs'
import path from 'node:path'

const EXCLUDED_DIRS = new Set(['node_modules', 'tests-external', 'sandbox', '.git'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const HTTP_SIGNAL = /from\s+["']supertest["']|require\(\s*["']supertest["']\s*\)/
const DB_SIGNAL = /#db\/|#db["'\s.]|pinned-pool\.ts|inPinnedTransaction|withTransaction/

export type TestLayers = {
  unit: string[]
  db: string[]
  http: string[]
  all: string[]
}

export function classifyTestFiles(root: string): TestLayers {
  const files = walk(root).sort()
  const unit: string[] = []
  const db: string[] = []
  const http: string[] = []

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    if (HTTP_SIGNAL.test(source)) http.push(file)
    else if (DB_SIGNAL.test(source)) db.push(file)
    else unit.push(file)
  }

  return { unit, db, http, all: files }
}
