import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { BREAKPOINTS, BREAKPOINT_ORDER } from '@dorado/components'

// packages/theme is the source of truth for the breakpoint scale; useBreakpoint
// carries a copy because a hook cannot read a Tailwind @theme block. This is the
// only place both halves are visible at once, so it is where the drift is caught.
// The components suite has no node types, which is why the guard lives here.
const themeCss = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../../packages/theme/theme.css'),
  'utf8'
)

describe('breakpoint scale', () => {
  it.each(BREAKPOINT_ORDER)('--breakpoint-%s matches the hook', (name) => {
    const match = new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem`).exec(themeCss)
    expect(match, `--breakpoint-${name} is missing from packages/theme/theme.css`).toBeTruthy()
    expect(Number(match![1]) * 16).toBe(BREAKPOINTS[name])
  })

  it('the theme declares no breakpoint the hook does not know', () => {
    const declared = [...themeCss.matchAll(/--breakpoint-([\w-]+):/g)].map((m) => m[1])
    expect([...new Set(declared)].sort()).toEqual([...BREAKPOINT_ORDER].sort())
  })
})
