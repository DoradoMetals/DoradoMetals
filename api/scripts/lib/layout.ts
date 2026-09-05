import fs from 'node:fs'
import path from 'node:path'

const NOT_DOMAINS = new Set(['db', 'shared', 'providers'])

type Manifest = { imports?: Record<string, string> }

function manifest(root: string): Manifest {
  const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  return JSON.parse(raw) as Manifest
}

export function importMap(root: string): Record<string, string> {
  return manifest(root).imports ?? {}
}

export function domainDirs(root: string): string[] {
  const dirs: string[] = []
  for (const [specifier, target] of Object.entries(importMap(root))) {
    if (!specifier.endsWith('/*')) continue
    const dir = target.replace(/^\.\//, '').replace(/\/\*$/, '')
    if (NOT_DOMAINS.has(dir)) continue
    dirs.push(dir)
  }
  return dirs.sort()
}

export function isTransportFile(rel: string): boolean {
  const base = path.basename(rel)
  return base === 'routes.ts' || base.endsWith('.routes.ts') || base === 'controller.ts'
}
