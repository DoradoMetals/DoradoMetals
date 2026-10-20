import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Stepper } from './Stepper'
import { expectNoAxeViolations } from '../test/axe'

describe('Stepper', () => {
  it('marks the current step for AT, and axe finds nothing', async () => {
    const { container } = render(<Stepper steps={['Shipping', 'Payment', 'Review']} current={1} />)
    const current = container.querySelector('[aria-current="step"]') as HTMLElement

    expect(current.getAttribute('aria-label')).toBe('Step 2 of 3: Payment')
    await expectNoAxeViolations(container)
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
    expect(check.getAttribute('class')).toMatch(/size-sm-plus/)
    expect(check.getAttribute('stroke-width')).toBe(String((2 * 14) / 24))
  })

  it('announces the current step through a polite live region as it changes', () => {
    const { container, rerender } = render(<Stepper steps={['Order', 'Review']} current={0} />)
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    expect(live.textContent).toBe('Step 1 of 2: Order')
    rerender(<Stepper steps={['Order', 'Review']} current={1} />)
    expect(live.textContent).toBe('Step 2 of 2: Review')
    expect(container.querySelector('[aria-current="step"]')!.getAttribute('aria-label')).toBe(
      'Step 2 of 2: Review'
    )
  })
})
