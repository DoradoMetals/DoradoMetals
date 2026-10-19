import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Accordion } from './Accordion'
import { expectNoAxeViolations } from '../test/axe'

describe('Accordion accessibility', () => {
  it('the trigger button sits inside a heading, and the panel is a labelled region', async () => {
    const { getByRole, container } = render(
      <Accordion label="Shipping details">
        <p>Body</p>
      </Accordion>
    )
    const heading = getByRole('heading', { name: 'Shipping details' })
    const trigger = getByRole('button', { name: 'Shipping details' })
    expect(heading.contains(trigger)).toBe(true)
    expect(trigger.className).toContain('focus-ring')
    fireEvent.click(trigger)
    const region = getByRole('region', { name: 'Shipping details' })
    expect(trigger.getAttribute('aria-controls')).toBe(region.id)
    await expectNoAxeViolations(container)
  })
})
