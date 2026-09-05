import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Progress } from './Progress'
import { axeViolations } from '../test/axe'

describe('Progress', () => {
  it('reports its value to assistive tech, and axe finds nothing', async () => {
    const { container } = render(<Progress value={66} aria-label="Upload progress" />)
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar.getAttribute('aria-valuenow')).toBe('66')
    expect(await axeViolations(container)).toEqual([])
  })

  it('the rail is the sanctioned pill and the indicator moves by transform', () => {
    const { container } = render(<Progress value={25} aria-label="p" />)
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar.className).toContain('rounded-full')
    const indicator = bar.firstElementChild as HTMLElement
    expect(indicator.style.transform).toBe('translateX(-75%)')
  })

  it('clamps out-of-range values instead of overflowing the rail', () => {
    const { container } = render(<Progress value={140} aria-label="p" />)
    const indicator = container.querySelector('[role="progressbar"]')!
      .firstElementChild as HTMLElement
    expect(indicator.style.transform).toBe('translateX(-0%)')
  })

  it('showValue renders the percent beside the rail, hidden from AT', () => {
    const { container } = render(<Progress value={66} showValue aria-label="p" />)
    const label = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(label).toBeTruthy()
    expect(label.textContent).toBe('66%')
  })
})
