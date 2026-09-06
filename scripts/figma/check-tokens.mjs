#!/usr/bin/env node
// figma:tokens - does packages/theme still say what the Figma file says?
//
// Reads the committed Figma snapshot (scripts/figma/snapshot.json, refreshed by
// an agent - see README) and compares every colour, spacing, radius and type
// step against theme.css / typography.css, converting units on both sides first
// (see lib.mjs for why that matters).
//
// It checks BOTH directions, because only one of them is the interesting one:
//   - a Figma variable whose CSS counterpart drifted is the obvious case
//   - a Figma variable with NO mapping at all is the case that actually bites:
//     someone adds `status/pending` to the library, designs against it, and the
//     app has no such colour. That reports as unmapped rather than passing.
//
// Exit 1 on any finding. No database, no network - safe in `pnpm check`.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readSnapshot, loadTheme, toColor, toHex, toPx, evalRadius, num, report, THEME_DIR } from './lib.mjs'
import * as M from './map.mjs'

const snap = readSnapshot()
const { vars, radiusPx } = loadTheme()
const byName = (coll) => new Map(snap.collections[coll].variables.map((v) => [v.name, v]))

const EPS = 0.01
const close = (a, b) => Math.abs(a - b) < EPS

let total = 0

// --- colour ---------------------------------------------------------------
{
  const findings = []
  const colours = byName('Color')
  for (const [name, v] of colours) {
    if (M.COLOR_ALIASES[name]) {
      const target = M.COLOR_ALIASES[name]
      if (v.alias !== target)
        findings.push(`${name}: snapshot aliases ${v.alias ?? 'nothing'}, map expects ${target}`)
      continue
    }
    const cssName = M.COLOR[name]
    if (!cssName) {
      findings.push(
        `${name} = ${v.value} is in Figma but mapped to no CSS property (add it to map.mjs COLOR, or to COLOR_ALIASES)`
      )
      continue
    }
    const declared = vars.get(cssName)
    if (declared === undefined) {
      findings.push(`${name} -> ${cssName}, which theme.css does not declare`)
      continue
    }
    const actual = toColor(declared)
    if (actual === null) {
      findings.push(`${name} -> ${cssName} = "${declared}", which is not a literal colour`)
      continue
    }
    if (actual.hex !== v.value)
      findings.push(`${name}: Figma ${v.value}, ${cssName} ${actual.hex} (${declared})`)
    const wantAlpha = v.opacity ?? 1
    if (Math.abs(actual.alpha - wantAlpha) > 0.005)
      findings.push(
        `${name} alpha: Figma ${num(wantAlpha)}, ${cssName} ${num(actual.alpha)} (${declared})`
      )
  }
  // The other direction: a literal colour in the CSS that Figma has no variable for.
  const mapped = new Set(Object.values(M.COLOR))
  for (const [k, val] of vars) {
    if (mapped.has(k) || M.COLOR_CSS_ONLY[k]) continue
    if (toHex(val) === null) continue
    findings.push(
      `${k} = ${val} is a literal colour in theme.css with no Figma variable (map it, or record it in COLOR_CSS_ONLY)`
    )
  }
  total += report(`Colour  (${colours.size} Figma variables)`, findings, {
    notes: Object.entries(M.COLOR_CSS_ONLY).map(([k, why]) => `accepted css-only: ${k} - ${why}`),
  })
}

// --- spacing, radius, breakpoints -----------------------------------------
{
  const findings = []
  const scale = byName('Scale')
  for (const [name, v] of scale) {
    if (M.SCALE_ALIASES[name]) {
      if (v.alias !== M.SCALE_ALIASES[name])
        findings.push(
          `${name}: snapshot aliases ${v.alias ?? 'nothing'}, map expects ${M.SCALE_ALIASES[name]}`
        )
      continue
    }
    const cssName = M.SCALE[name]
    if (!cssName) {
      findings.push(`${name} = ${v.value} is in Figma but mapped to no CSS property`)
      continue
    }
    const declared = vars.get(cssName)
    if (declared === undefined) {
      findings.push(`${name} -> ${cssName}, which theme.css does not declare`)
      continue
    }
    const actual = name.startsWith('radius/') ? evalRadius(declared, radiusPx) : toPx(declared)
    if (actual === null) {
      findings.push(`${name} -> ${cssName} = "${declared}", which this check cannot resolve to px`)
      continue
    }
    const want = M.SCALE_PERCENT[name] ? v.value / 100 : v.value
    if (!close(actual, want))
      findings.push(`${name}: Figma ${num(want)}, ${cssName} ${num(actual)} (${declared})`)
  }
  total += report(`Scale  (${scale.size} Figma variables)`, findings, {
    notes: Object.entries(M.SCALE_PERCENT).map(([k, why]) => `percent-scaled: ${k} - ${why}`),
  })
}

// --- the type ramp --------------------------------------------------------
{
  const findings = []
  const type = byName('Typography')
  for (const step of M.TYPE_STEPS) {
    const size = vars.get(`--text-${step}`)
    if (size === undefined) {
      findings.push(`--text-${step} is not declared in theme.css`)
      continue
    }
    const sizePx = toPx(size)
    const wantSize = type.get(`size/${step}`)
    if (!wantSize) {
      findings.push(`Figma has no size/${step} for the --text-${step} step`)
      continue
    }
    if (!close(sizePx, wantSize.value))
      findings.push(
        `size/${step}: Figma ${num(wantSize.value)}px, --text-${step} ${num(sizePx)}px (${size})`
      )

    // line-height is a unitless ratio in the CSS, px in Figma
    const lhRatio = toPx(vars.get(`--text-${step}--line-height`) ?? '')
    const wantLh = type.get(`line-height/${step}`)
    if (lhRatio !== null && wantLh) {
      const lhPx = lhRatio * sizePx
      if (!close(lhPx, wantLh.value))
        findings.push(
          `line-height/${step}: Figma ${num(wantLh.value)}px, CSS ${num(lhRatio)} x ${num(sizePx)} = ${num(lhPx)}px`
        )
    }
    // letter-spacing is em in the CSS, px in Figma
    const lsRaw = vars.get(`--text-${step}--letter-spacing`)
    const wantLs = type.get(`letter-spacing/${step}`)
    if (lsRaw !== undefined && wantLs) {
      const em = Number(/^(-?[\d.]+)em$/.exec(lsRaw.trim())?.[1] ?? NaN)
      if (Number.isNaN(em))
        findings.push(`--text-${step}--letter-spacing = "${lsRaw}" is not in em`)
      else {
        const lsPx = em * sizePx
        if (!close(lsPx, wantLs.value))
          findings.push(
            `letter-spacing/${step}: Figma ${num(wantLs.value)}px, CSS ${num(em)}em x ${num(sizePx)} = ${num(lsPx)}px`
          )
      }
    }
  }
  total += report(`Type ramp  (${M.TYPE_STEPS.length} steps)`, findings)
}

// --- text styles ----------------------------------------------------------
{
  const findings = []
  for (const s of snap.textStyles) {
    const spec = M.TEXT_STYLES[s.name]
    if (!spec) {
      findings.push(`text style "${s.name}" has no ramp step in map.mjs TEXT_STYLES`)
      continue
    }
    const sizePx = toPx(vars.get(`--text-${spec.step}`) ?? '')
    if (sizePx === null) {
      findings.push(`"${s.name}" -> --text-${spec.step}, which theme.css does not declare`)
      continue
    }
    if (!close(s.fontSize, sizePx))
      findings.push(`"${s.name}": Figma ${num(s.fontSize)}px, --text-${spec.step} ${num(sizePx)}px`)
    const lhRatio = toPx(vars.get(`--text-${spec.step}--line-height`) ?? '')
    if (lhRatio !== null && !close(s.lineHeight, lhRatio * sizePx)) {
      findings.push(
        `"${s.name}" line-height: Figma ${num(s.lineHeight)}px, ramp ${num(lhRatio * sizePx)}px`
      )
    }
    if (spec.canonical) {
      const want = M.FONT_WEIGHT[s.style]
      const declared = Number(vars.get(`--text-${spec.step}--font-weight`))
      if (want && declared && want !== declared) {
        findings.push(
          `"${s.name}" weight: Figma ${s.style} (${want}), --text-${spec.step}--font-weight ${declared}`
        )
      }
    }
  }

  // Eyebrow is the one style whose tracking and family live in a rule rather
  // than the ramp, so it is parsed out of typography.css directly.
  const eyebrow = snap.textStyles.find((s) => s.name === 'Eyebrow')
  if (eyebrow) {
    const css = readFileSync(path.join(THEME_DIR, 'typography.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    const rule = /\.eyebrow\s*\{([^}]*)\}/.exec(css)
    if (!rule) findings.push('Eyebrow: typography.css has no .eyebrow rule to compare against')
    else {
      const body = rule[1]
      const ls = /letter-spacing:\s*(-?[\d.]+)em/.exec(body)
      const size = toPx(vars.get('--text-micro') ?? '')
      if (ls && size !== null && !close(Number(ls[1]) * size, eyebrow.letterSpacing)) {
        findings.push(
          `Eyebrow letter-spacing: Figma ${num(eyebrow.letterSpacing)}px, .eyebrow ${ls[1]}em x ${num(size)} = ${num(Number(ls[1]) * size)}px`
        )
      }
      const weight = /font-weight:\s*(\d+)/.exec(body)
      const want = M.FONT_WEIGHT[eyebrow.style]
      if (weight && want && Number(weight[1]) !== want) {
        findings.push(`Eyebrow weight: Figma ${eyebrow.style} (${want}), .eyebrow ${weight[1]}`)
      }
      if (!/font-family:\s*var\(--font-mono\)/.test(body)) {
        findings.push(
          `Eyebrow: Figma draws it in ${eyebrow.family}, but .eyebrow does not set font-family: var(--font-mono)`
        )
      }
    }
  }
  total += report(`Text styles  (${snap.textStyles.length})`, findings)
}

console.log(
  total === 0
    ? 'figma:tokens clean'
    : `figma:tokens FAILED - ${total} finding${total === 1 ? '' : 's'}`
)
process.exit(total === 0 ? 0 : 1)
