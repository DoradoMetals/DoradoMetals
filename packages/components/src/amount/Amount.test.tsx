import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Amount, type AmountTag } from './Amount'
import { expectNoAxeViolations } from '../test/axe'

const TAG_RAMP: Array<[AmountTag, string]> = [
  ['display', 'display'],
  ['stat-lg', 'stat-lg'],
  ['stat', 'stat'],
  ['stat-sm', 'stat-sm'],
  ['stat-xs', 'stat-xs'],
  ['stat-2xs', 'stat-2xs'],
  ['body', 'text-body'],
  ['small', 'text-small'],
  ['micro', 'micro'],
]

describe('Amount', () => {
  it('formats as USD at two decimals by default, and axe finds nothing', async () => {
    const { container } = render(<Amount value={2411.2} />)
    const el = container.firstElementChild!
    expect(el.textContent).toContain('$2,411.20')
    await expectNoAxeViolations(container)
  })

  it('accepts a format override for non-currency figures', () => {
    const { container } = render(
      <Amount value={0.9999} format={{ style: 'percent', minimumFractionDigits: 2 }} />
    )
    expect(container.firstElementChild!.textContent).toContain('99.99%')
  })

  it('always carries tabular-nums, with or without a format override', () => {
    const { container: withDefault } = render(<Amount value={2411.2} />)
    expect(withDefault.firstElementChild!.className).toContain('tabular-nums')

    const { container: withOverride } = render(
      <Amount value={12} format={{ style: 'decimal' }} className="text-destructive" />
    )
    expect(withOverride.firstElementChild!.className).toContain('tabular-nums')
    expect(withOverride.firstElementChild!.className).toContain('text-destructive')
  })

  it('renders one bare inline element with no wrapper and no layout classes', () => {
    const { container } = render(<Amount value={2411.2} />)
    expect(container.children.length).toBe(1)
    const el = container.firstElementChild!
    expect(el.tagName.toLowerCase()).not.toBe('div')
    expect(el.className).not.toMatch(/\b(flex|grid|block|inline-block|inline-flex)\b/)
  })

  it('sets no size or colour class, so it inherits from its container', () => {
    const { container } = render(<Amount value={2411.2} />)
    const el = container.firstElementChild!
    expect(el.className).not.toMatch(/\btext-(display|h[1-6]|body|small|micro|stat|stat-sm)\b/)
    expect(el.className).not.toMatch(/\btext-(foreground|muted-foreground|success|destructive)\b/)
  })

  it.each(TAG_RAMP)(
    'tag=%s carries the %s ramp token (612:12 Tag variant, all nine)',
    (tag, token) => {
      const { container } = render(<Amount value={2411.2} tag={tag} />)
      expect(container.firstElementChild!.className.split(' ')).toContain(token)
    }
  )
})
