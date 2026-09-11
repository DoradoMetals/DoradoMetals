import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Text, type TextVariant } from './Text'
import { axeViolations } from '../test/axe'

// The Foundations ramp, by the names the Figma snapshot's textStyles carry.
const RAMP: Array<[TextVariant, string, string]> = [
  ['display', 'display', 'H1'],
  ['h1', 'text-h1', 'H1'],
  ['h2', 'text-h2', 'H2'],
  ['h3', 'text-h3', 'H3'],
  ['h4', 'text-h4', 'H4'],
  ['h5', 'text-h5', 'H5'],
  ['h6', 'text-h6', 'H6'],
  ['body', 'text-body', 'P'],
  ['body-medium', 'text-body', 'P'],
  ['small', 'text-small', 'SMALL'],
  ['small-medium', 'text-small', 'SMALL'],
  ['micro', 'micro', 'P'],
  ['micro-medium', 'micro', 'P'],
  ['eyebrow', 'eyebrow', 'P'],
  ['stat', 'stat', 'P'],
  ['stat-sm', 'stat-sm', 'P'],
]

describe('Text', () => {
  it('covers all sixteen Foundations text styles', () => {
    expect(RAMP.length).toBe(16)
  })

  it.each(RAMP)('%s carries the ramp token and its default tag', (variant, token, tag) => {
    const { container } = render(<Text variant={variant}>Metal</Text>)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe(tag)
    expect(el.className.split(' ')).toContain(token)
  })

  it('sets no raw font utility - the ramp token is the whole appearance', () => {
    for (const [variant] of RAMP) {
      const { container } = render(<Text variant={variant}>Metal</Text>)
      const cls = (container.firstElementChild as HTMLElement).className
      expect(cls).not.toMatch(/\btext-(xs|sm|base|lg|xl|\dxl)\b/)
      expect(cls).not.toMatch(/\bleading-\[|\btracking-\[/)
    }
  })

  it('the medium weights differ from their regular siblings by font-medium alone', () => {
    for (const pair of [
      ['body', 'body-medium'],
      ['small', 'small-medium'],
      ['micro', 'micro-medium'],
    ] as Array<[TextVariant, TextVariant]>) {
      const { container: a } = render(<Text variant={pair[0]}>x</Text>)
      const { container: b } = render(<Text variant={pair[1]}>x</Text>)
      const regular = (a.firstElementChild as HTMLElement).className.split(' ')
      const medium = (b.firstElementChild as HTMLElement).className.split(' ')
      expect(medium.filter((c) => !regular.includes(c))).toEqual(['font-medium'])
    }
  })

  it('`as` overrides the tag without changing the variant', () => {
    const { container } = render(
      <Text variant="h2" as="p">
        Totals
      </Text>
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('P')
    expect(el.className.split(' ')).toContain('text-h2')
  })

  it('emphasis is a token attribute, not a colour class', () => {
    const { container } = render(<Text emphasis="subtlest">Quiet</Text>)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-emphasis')).toBe('subtlest')
    expect(el.className).not.toMatch(/text-(muted-foreground|subtle)/)
  })

  it('emphasis is absent when not asked for', () => {
    const { container } = render(<Text>Plain</Text>)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-emphasis')).toBe(false)
  })

  it('passes through className and DOM attributes, and axe finds nothing', async () => {
    const { container, getByText } = render(
      <Text variant="h3" className="mt-md" id="lede">
        Lot 14
      </Text>
    )
    const el = getByText('Lot 14')
    expect(el.id).toBe('lede')
    expect(el.className.split(' ')).toContain('mt-md')
    expect(await axeViolations(container)).toEqual([])
  })
})
