#!/usr/bin/env node
// figma:inventory - which drawings have code, which code has a drawing, and
// which map entries have gone stale.
//
// The component library's own README says it ships "the code half of the Figma
// 'Themes and Components' file, one component at a time as each is audited
// against it". Nothing enforced the halves lining up, so the answer to "what is
// drawn but not built" lived in nobody's head. This reads the page list out of
// the snapshot and the directory list out of packages/components/src, and
// reconciles them through map.mjs.
//
// PENDING is a QUEUE, not a failure: a page drawn ahead of its code is the
// normal order of work here. What DOES fail is the map going stale - a pending
// page that has since been built, an accepted exception whose page was renamed
// or deleted, or a page/directory nobody has classified at all. That keeps the
// list honest instead of letting it rot into a graveyard.
//
// Exit 1 on any finding. No database, no network.

import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, readSnapshot, report } from './lib.mjs'
import * as M from './map.mjs'

const snap = readSnapshot()
const SRC = path.join(ROOT, 'packages', 'components', 'src')

const kebab = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const dirFor = (page) => M.PAGE_TO_DIR[page] ?? kebab(page)

const dirs = new Set(
  readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'test')
    .map((e) => e.name)
)

// "Built" means EXPORTED, not "a directory exists". A folder with a half-written
// file in it is work in flight, and a gate that goes red the moment someone
// creates a directory is a gate people turn off. index.ts is the deliverable -
// it is what the frontend can actually import - so that is what counts.
const indexSrc = existsSync(path.join(SRC, 'index.ts'))
  ? readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  : ''
const isBuilt = (dir) => dirs.has(dir) && indexSrc.includes(`./${dir}/`)
const pages = snap.pages.map((p) => p.name)
const pageSet = new Set(pages)

const findings = []
const queue = []
const claimed = new Set()

// --- every Figma page must be classified --------------------------------
for (const page of pages) {
  if (M.NOT_A_COMPONENT[page]) continue
  if (M.PENDING[page]) {
    const dir = dirFor(page)
    if (isBuilt(dir)) {
      findings.push(
        `"${page}" is listed PENDING but index.ts now exports ./${dir}/ - it is built, so remove it from PENDING in map.mjs`
      )
      claimed.add(dir)
    } else {
      const started = dirs.has(dir) ? '  [started: src/' + dir + ' exists, not exported yet]' : ''
      queue.push(`${page} - ${M.PENDING[page]}${started}`)
    }
    // The page IS the drawing, built or not - so the directory is spoken for
    // and must not also be reported as undrawn by the reverse sweep below.
    claimed.add(dir)
    continue
  }
  const dir = dirFor(page)
  if (!isBuilt(dir)) {
    const why = dirs.has(dir)
      ? `packages/components/src/${dir} exists but index.ts does not export it`
      : `packages/components/src/${dir} does not exist`
    findings.push(
      `"${page}" is drawn in Figma but not built - ${why} (build it, add it to PENDING, or map it in PAGE_TO_DIR)`
    )
    continue
  }
  claimed.add(dir)
}

// --- every component directory must have a drawing ------------------------
for (const dir of [...dirs].sort()) {
  if (claimed.has(dir)) continue
  if (M.DIR_NOT_DRAWN[dir]) continue
  const page = M.DIR_TO_PAGE[dir]
  if (page && pageSet.has(page)) continue
  if (page) {
    findings.push(
      `DIR_TO_PAGE maps ${dir} -> "${page}", which is not a page in the Figma file any more`
    )
    continue
  }
  findings.push(
    `packages/components/src/${dir} has no Figma page (draw it, map it in DIR_TO_PAGE, or record it in DIR_NOT_DRAWN)`
  )
}

// --- the map itself must not go stale -------------------------------------
for (const [page, why] of Object.entries(M.PENDING)) {
  if (!pageSet.has(page))
    findings.push(
      `PENDING lists "${page}" (${why}) but the Figma file has no such page - it was renamed or deleted`
    )
}
for (const page of Object.keys(M.NOT_A_COMPONENT)) {
  if (!pageSet.has(page))
    findings.push(`NOT_A_COMPONENT lists "${page}" but the Figma file has no such page`)
}
for (const [page, dir] of Object.entries(M.PAGE_TO_DIR)) {
  if (!pageSet.has(page))
    findings.push(`PAGE_TO_DIR lists "${page}" but the Figma file has no such page`)
  else if (!dirs.has(dir))
    findings.push(
      `PAGE_TO_DIR maps "${page}" -> ${dir}, which is not a directory in packages/components/src`
    )
}
for (const dir of Object.keys(M.DIR_NOT_DRAWN)) {
  if (!dirs.has(dir))
    findings.push(`DIR_NOT_DRAWN lists ${dir}, which is not a directory in packages/components/src`)
}

// --- index.ts must actually export what is on disk ------------------------
{
  if (!indexSrc) findings.push('packages/components/src/index.ts is missing or empty')
  else {
    const pendingDirs = new Set(Object.keys(M.PENDING).map(dirFor))
    for (const dir of [...dirs].sort()) {
      if (M.DIR_NOT_DRAWN[dir]) continue
      // A directory whose page is still PENDING is being written right now.
      if (pendingDirs.has(dir)) continue
      if (!indexSrc.includes(`./${dir}/`))
        findings.push(`packages/components/src/${dir} is on disk but not exported from index.ts`)
    }
  }
}

const notes = [
  `${pages.length} Figma pages, ${dirs.size} component directories`,
  ...Object.entries(M.NOT_A_COMPONENT).map(([p, why]) => `not a component: ${p} - ${why}`),
]
if (queue.length) {
  notes.push('', `drawn, not yet built (${queue.length}):`)
  for (const q of queue) notes.push('  ' + q)
  notes.push('')
}

const count = report('Figma pages vs packages/components/src', findings, { notes })
console.log(
  count === 0
    ? 'figma:inventory clean'
    : `figma:inventory FAILED - ${count} finding${count === 1 ? '' : 's'}`
)
process.exit(count === 0 ? 0 : 1)
