#!/usr/bin/env node
// figma:hygiene - a ratchet on design-system drift inside the Figma file.
//
// Counts, per category, the things that make a drawing stop being a source of
// truth: a colour that is a hex instead of a variable, a gap that is a number
// instead of a spacing token, text with raw font properties instead of a text
// style, and icons whose stroke weight does not match their size. It reads the
// counts captured in snapshot.json and compares them to HYGIENE_BUDGET.
//
// WHY A BUDGET AND NOT ZERO: the file has 3911 component nodes drawn over
// months, and it has real drift. Failing on all of it would mean the check gets
// disabled on day one. Failing on GROWTH means the next component cannot add to
// the pile, and every fix ratchets the number down. Same discipline as the
// API's audit floors.
//
// This reads a captured snapshot, so it is only as fresh as the last capture -
// see README. Exit 1 if any category exceeds its budget, or if a budget is
// higher than the measurement (which means someone fixed something and did not
// lower the budget, so the ratchet has gone slack).

import { readSnapshot, report } from './lib.mjs'
import { HYGIENE_BUDGET, HYGIENE_NOTES } from './map.mjs'

const snap = readSnapshot()
const h = snap.hygiene
if (!h) {
  console.error('snapshot.json has no `hygiene` block - re-capture (see scripts/figma/README.md)')
  process.exit(1)
}

const LABEL = {
  color: 'unbound colour (fill/stroke with no Color variable)',
  spacing: 'unbound gap/padding (no Scale variable)',
  radius: 'unbound corner radius (no Scale variable)',
  textStyle: 'text with no text style',
  iconFill: 'icon instance carrying its own background fill',
  iconWeight: 'icon stroke weight not 2 x (size/24)',
}

const findings = []
const notes = [`captured ${snap.capturedAt} over ${h.scanned} component nodes`, '']

for (const [cat, budget] of Object.entries(HYGIENE_BUDGET)) {
  const actual = h.totals[cat]
  if (actual === undefined) {
    findings.push(`${cat}: budgeted but the snapshot does not measure it`)
    continue
  }
  if (actual > budget) {
    findings.push(`${cat} rose to ${actual}, budget ${budget} - ${LABEL[cat]}`)
  } else if (actual < budget) {
    findings.push(
      `${cat} is down to ${actual} but HYGIENE_BUDGET still says ${budget} - lower it in map.mjs so the ratchet holds`
    )
  } else {
    notes.push(`  ${String(actual).padStart(4)}  ${cat} - ${LABEL[cat]}`)
  }
}
for (const cat of Object.keys(h.totals)) {
  if (!(cat in HYGIENE_BUDGET)) findings.push(`${cat} is measured but has no budget in map.mjs`)
}

notes.push('')
const worst = Object.entries(h.perPage)
  .map(([page, c]) => [page, Object.values(c).reduce((a, b) => a + b, 0)])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
notes.push('worst pages: ' + worst.map(([p, n]) => `${p} (${n})`).join(', '))
notes.push('')
for (const n of HYGIENE_NOTES) notes.push('note: ' + n)

const count = report('Figma design-system hygiene', findings, { notes })
console.log(
  count === 0
    ? 'figma:hygiene clean (at budget)'
    : `figma:hygiene FAILED - ${count} finding${count === 1 ? '' : 's'}`
)
process.exit(count === 0 ? 0 : 1)
