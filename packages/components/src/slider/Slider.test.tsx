import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Slider } from './Slider'
import { axeViolations } from '../test/axe'

describe('Slider', () => {
  it('exposes value through slider role, and axe finds nothing', async () => {
    const { container } = render(
      <Slider aria-label="Purity" min={0} max={100} defaultValue={[40]} />
    )
    const thumb = container.querySelector('[role="slider"]') as HTMLElement
    expect(thumb.getAttribute('aria-valuenow')).toBe('40')
    expect(thumb.getAttribute('aria-valuemax')).toBe('100')
    expect(await axeViolations(container)).toEqual([])
  })

  it('arrow keys step the value', () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <Slider
        aria-label="Purity"
        min={0}
        max={10}
        step={1}
        defaultValue={[5]}
        onValueChange={onValueChange}
      />
    )
    fireEvent.keyDown(container.querySelector('[role="slider"]')!, { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenCalledWith([6])
  })

  it('the fill swaps to border/strong when disabled, not just a dimmed primary (31:115)', () => {
    const { container } = render(
      <Slider aria-label="Purity" min={0} max={100} defaultValue={[50]} disabled />
    )
    const range = container.querySelector('.bg-primary') as HTMLElement
    expect(range.className).toContain('data-[disabled]:bg-border-strong')
  })
})
