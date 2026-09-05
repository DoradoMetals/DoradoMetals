import { describe, expect, it } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Tooltip, TooltipProvider } from './Tooltip'

describe('Tooltip', () => {
  it('opens on focus - keyboard users get the hint too', async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip content="Live spot, refreshed each minute">
          <button>Spot price</button>
        </Tooltip>
      </TooltipProvider>
    )
    await act(async () => {
      fireEvent.focus(getByRole('button'))
    })
    const tip = document.body.querySelector('[role="tooltip"]')
    expect(tip?.textContent).toContain('Live spot')
  })

  it("the arrow is Radix's own filled triangle, no border", async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip content="Live spot, refreshed each minute">
          <button>Spot price</button>
        </Tooltip>
      </TooltipProvider>
    )
    await act(async () => {
      fireEvent.focus(getByRole('button'))
    })
    const arrow = document.body.querySelector('[role="tooltip"] svg') as SVGElement
    expect(arrow).toBeTruthy()
    expect(arrow.getAttribute('class') ?? '').toContain('fill-highest')
    const span = document.body.querySelector('[role="tooltip"] span.rotate-45')
    expect(span).toBeNull()
  })
})
