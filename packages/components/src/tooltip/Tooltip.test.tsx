import { describe, expect, it } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Tooltip, TooltipProvider } from './Tooltip'

describe('Tooltip', () => {
  it('opens on focus - keyboard users get the hint too', async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip label="Live spot, refreshed each minute">
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
        <Tooltip label="Live spot, refreshed each minute">
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

  it('the label is Small/Regular text in the bubble (32:159)', async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip label="Melt value only">
          <button>Value</button>
        </Tooltip>
      </TooltipProvider>
    )
    await act(async () => {
      fireEvent.focus(getByRole('button'))
    })
    const label = [...document.body.querySelectorAll('p')].find(
      (p) => p.textContent === 'Melt value only'
    )
    expect(label?.className).toContain('text-small')
  })

  it('content is a passthrough slot: a feature component renders as given (1153:2)', async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip content={<div data-testid="feature">Gold $2,400</div>}>
          <button>Point</button>
        </Tooltip>
      </TooltipProvider>
    )
    await act(async () => {
      fireEvent.focus(getByRole('button'))
    })
    const slot = document.body.querySelector('[data-testid="feature"]') as HTMLElement
    expect(slot).toBeTruthy()
    expect(slot.parentElement?.tagName).not.toBe('P')
  })

  it('with neither label nor content it renders the children alone', () => {
    const { container, getByRole } = render(
      <TooltipProvider>
        <Tooltip>
          <button>Bare</button>
        </Tooltip>
      </TooltipProvider>
    )
    const button = getByRole('button', { name: 'Bare' })
    expect(button.hasAttribute('data-state')).toBe(false)
    expect(container.firstElementChild).toBe(button)
  })
})
