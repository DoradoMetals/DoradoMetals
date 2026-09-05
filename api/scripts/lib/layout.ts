import fs from 'node:fs'
import path from 'node:path'

export const SRC = 'src'

const NOT_DOMAINS = new Set(['db', 'shared', 'providers'])

type Manifest = { imports?: Record<string, string> }

function manifest(root: string): Manifest {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as Manifest
  } catch {
    return {}
  }
}

export function importMap(root: string): Record<string, string> {
  return manifest(root).imports ?? {}
}

const strip = (target: string): string => target.replace(/^\.\//, '').replace(/\/\*$/, '')

const unSrc = (dir: string): string =>
  dir === SRC || dir.startsWith(`${SRC}/`) ? dir.slice(SRC.length + 1) : dir

export function sourceRoot(root: string): string {
  const targets = Object.values(importMap(root))
  const under = targets.length > 0 && targets.every((t) => t.startsWith(`./${SRC}/`))
  return under ? path.join(root, SRC) : root
}

export function domainDirs(root: string): string[] {
  const dirs: string[] = []
  for (const [specifier, target] of Object.entries(importMap(root))) {
    if (!specifier.endsWith('/*')) continue
    const dir = unSrc(strip(target))
    if (NOT_DOMAINS.has(dir)) continue
    dirs.push(dir)
  }
  return dirs.sort()
}

// '#accounts' -> 'domains/accounts', '#db' -> 'db'. The lints that resolve a
// subpath specifier to a file need the alias-to-directory map, not the head.
export function wildcardRoots(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [specifier, target] of Object.entries(importMap(root))) {
    if (!specifier.endsWith('/*')) continue
    out[specifier.slice(1, -2)] = unSrc(strip(target))
  }
  return out
}

export function isTransportFile(rel: string): boolean {
  const base = path.basename(rel)
  return base === 'routes.ts' || base.endsWith('.routes.ts') || base === 'controller.ts'
}
