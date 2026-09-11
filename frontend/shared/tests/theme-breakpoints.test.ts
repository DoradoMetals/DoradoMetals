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

// The Mobile type ramp (ruling 103, 2026-09-11). The Figma Typography
// collection's second mode is the design half; this block is the code half,
// and scripts/figma/check-tokens.mjs compares the two value by value. What it
// CANNOT check is the one thing CSS will not let the theme express: a media
// query cannot read a custom property, so the 48rem is a literal. This is
// where the literal is pinned to the token it stands for.
describe('the mobile type ramp', () => {
  const block = /@media\s*\(\s*width\s*<\s*([\d.]+)rem\s*\)\s*\{([\s\S]*?)\n\}/.exec(themeCss)

  it('switches at --breakpoint-md', () => {
    expect(block, 'theme.css has no (width < Nrem) ramp block').toBeTruthy()
    const md = /--breakpoint-md:\s*([\d.]+)rem/.exec(themeCss)
    expect(md).toBeTruthy()
    expect(Number(block![1])).toBe(Number(md![1]))
  })

  it('moves exactly the five steps the library moves', () => {
    const sizes = [...block![2].matchAll(/--text-([a-z0-9-]+):\s/g)]
      .map((m) => m[1])
      // `--text-h1--line-height` is a property OF a step, not a step.
      .filter((name) => !name.includes('--'))
    expect([...sizes].sort()).toEqual(['display', 'h1', 'h2', 'stat', 'stat-sm'])
  })

  it('pins the Hero headline at 32/38', () => {
    expect(/--text-h1:\s*2rem;/.test(block![2])).toBe(true)
    expect(/--text-h1--line-height:\s*1\.1875;/.test(block![2])).toBe(true)
    expect(2 * 16).toBe(32)
    expect(1.1875 * 32).toBe(38)
  })
})
