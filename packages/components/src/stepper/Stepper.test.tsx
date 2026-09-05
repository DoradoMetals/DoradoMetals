import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Stepper } from './Stepper'
import { axeViolations } from '../test/axe'

describe('Stepper', () => {
  it('marks the current step for AT, and axe finds nothing', async () => {
    const { container } = render(<Stepper steps={['Shipping', 'Payment', 'Review']} current={1} />)
    const current = container.querySelector('[aria-current="step"]') as HTMLElement

    expect(current.getAttribute('aria-label')).toBe('Step 2 of 3: Payment')
    expect(await axeViolations(container)).toEqual([])
  })

  it('takes a bare count too', () => {
    const { container } = render(<Stepper steps={4} current={2} />)
    expect(container.querySelector('[aria-current="step"]')).toBeTruthy()
  })

  it('filled connectors are primary, un-filled ones are border-strong', () => {
    const { container } = render(<Stepper steps={4} current={2} />)
    const connectors = [...container.querySelectorAll('span[aria-hidden="true"]')]
    expect(connectors).toHaveLength(3)
    expect(connectors[0].className).toContain('bg-primary')
    expect(connectors[1].className).toContain('bg-primary')
    expect(connectors[2].className).toContain('bg-border-strong')
    expect(connectors[2].className).not.toContain('bg-border ')
  })

  it("the complete check is 14px at a scale-true stroke, matching Tracker Node (54:56: 'brought over')", () => {
    const { container } = render(<Stepper steps={3} current={2} />)
    const check = container.querySelector('li svg') as SVGElement
    expect(check.getAttribute('class')).toMatch(/size-3\.5/)
    expect(check.getAttribute('stroke-width')).toBe(String((2 * 14) / 24))
  })
})
