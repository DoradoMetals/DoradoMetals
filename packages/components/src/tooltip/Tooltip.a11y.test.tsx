import { describe, expect, it } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Tooltip, TooltipProvider } from './Tooltip'
import { expectNoAxeViolations } from '../test/axe'

describe('Tooltip accessibility', () => {
  it('the trigger is described by the tooltip while it shows, and Escape hides it', async () => {
    const { getByRole, queryByRole } = render(
      <TooltipProvider>
        <Tooltip label="Spot price, refreshed every minute" delayDuration={0}>
          <button type="button">Spot</button>
        </Tooltip>
      </TooltipProvider>
    )
    const trigger = getByRole('button', { name: 'Spot' })
    await act(async () => {
      fireEvent.focus(trigger)
    })
    const tip = getByRole('tooltip')
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBe(tip.id)
    expect(tip.textContent).toContain('Spot price, refreshed every minute')
    await expectNoAxeViolations(document.body)
    await act(async () => {
      fireEvent.keyDown(trigger, { key: 'Escape' })
    })
    expect(queryByRole('tooltip')).toBeNull()
  })
})
