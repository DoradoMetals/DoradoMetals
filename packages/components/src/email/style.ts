import { fontStack, monoStack, space, radius, text, stroke } from '@dorado/theme/tokens'
import type { CSSProperties } from 'react'

export { fontStack, monoStack, space, radius, stroke }

export const WIDTH = { outer: 600, inner: 536 } as const

export const GUTTER = space.xl

export type Step = 'micro' | 'small' | 'body' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'stat-sm'

const cache = new Map<string, CSSProperties>()

export function type(step: Step, extra: CSSProperties = {}): CSSProperties {
  let base = cache.get(step)
  if (!base) {
    const t = text(step)
    base = {
      fontFamily: fontStack,
      fontSize: t.size,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
      fontWeight: t.weight,
    }
    cache.set(step, base)
  }
  return { ...base, ...extra }
}

export function eyebrowType(extra: CSSProperties = {}): CSSProperties {
  const t = text('micro')
  return {
    fontFamily: monoStack,
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: '1.2px',
    fontWeight: 500,
    textTransform: 'uppercase',
    ...extra,
  }
}
