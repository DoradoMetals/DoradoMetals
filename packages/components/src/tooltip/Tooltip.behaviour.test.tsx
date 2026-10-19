import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import * as React from 'react'

import { Tooltip, TooltipProvider } from './Tooltip'
import { setup, useUserFakeTimers } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Tip(props: Omit<React.ComponentProps<typeof Tooltip>, 'children'>) {
  return (
    <TooltipProvider>
      <Tooltip {...props}>
        <button type="button">Spot</button>
      </Tooltip>
    </TooltipProvider>
  )
}

describe('Tooltip slots and behaviour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Tab opens it with the label and the content slot together; axe finds nothing open', async () => {
    const { user } = setup(<Tip label="Live spot" content={<a href="#chart">Open chart</a>} />)
    await user.tab()
    const tip = await vi.waitFor(() => {
      const found = document.body.querySelector('[role="tooltip"]')
      if (!found) throw new Error('closed')
      return found
    })
    expect(tip.textContent).toContain('Live spot')
    expect(tip.textContent).toContain('Open chart')
    await expectNoAxeViolations(document.body)
  })

  it('content alone renders without a label line', async () => {
    const { user } = setup(<Tip content={<span>Only content</span>} />)
    await user.tab()
    const content = await vi.waitFor(() => {
      const found = document.querySelector('[data-side]')
      if (!found) throw new Error('closed')
      return found
    })
    expect(content.querySelector('p')).toBeNull()
    expect(content.textContent).toContain('Only content')
  })

  it('Escape closes it', async () => {
    const { user } = setup(<Tip label="Live spot" />)
    await user.tab()
    await vi.waitFor(() => {
      if (!document.querySelector('[role="tooltip"]')) throw new Error('closed')
    })
    await user.keyboard('{Escape}')
    expect(document.querySelector('[data-side]')).toBeNull()
  })

  it('hover opens after the delay, on the side asked for', async () => {
    useUserFakeTimers()
    const { user, getByRole } = setup(<Tip label="Live spot" side="bottom" delayDuration={500} />, {
      fakeTimers: true,
    })
    await user.hover(getByRole('button'))
    expect(document.querySelector('[data-side]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(document.querySelector('[data-side]')!.getAttribute('data-side')).toBe('bottom')
  })

  it('with no label and no content it is the bare trigger', async () => {
    const { user, container } = setup(<Tip />)
    await user.tab()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await expectNoAxeViolations(container)
  })
})
