import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Chip } from './Chip'
import { axeViolations } from '../test/axe'

describe('Chip', () => {
  it('selection is aria-pressed, and axe finds nothing', async () => {
    const { getByRole, container } = render(<Chip label="Gold" selected />)
    expect(getByRole('button', { name: /Gold/ }).getAttribute('aria-pressed')).toBe('true')
    expect(await axeViolations(container)).toEqual([])
  })

  it("dismiss is separate from the chip's own press", () => {
    const onDismiss = vi.fn()
    const onClick = vi.fn()
    const { getByRole } = render(<Chip label="Silver" onDismiss={onDismiss} onClick={onClick} />)
    fireEvent.click(getByRole('button', { name: /remove|dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('unselected hover escalates both the fill and the border', () => {
    const { getByRole } = render(<Chip label="Gold" />)
    const chip = getByRole('button', { name: /Gold/ })
    expect(chip.className).toMatch(/hover:border-border-strong/)
    expect(chip.className).toMatch(/hover:bg-accent/)
  })

  it("the dismiss glyph matches the library's 14px dismiss size", () => {
    const { container } = render(<Chip label="Gold" onDismiss={() => {}} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toMatch(/size-3\.5/)
  })
})
