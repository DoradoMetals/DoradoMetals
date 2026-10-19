import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Progress } from './Progress'
import { Stepper } from '../stepper/Stepper'
import { expectNoAxeViolations } from '../test/axe'

describe('Progress and Stepper accessibility', () => {
  it('a progress bar without a caller label still has a name and reports aria-valuenow', async () => {
    const { getByRole, container } = render(<Progress value={40} />)
    const bar = getByRole('progressbar', { name: 'Progress' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    await expectNoAxeViolations(container)
  })

  it('the stepper list names the position as a whole', async () => {
    const { getByRole, container } = render(
      <Stepper steps={['Shipping', 'Payment', 'Review']} current={1} />
    )
    expect(getByRole('list', { name: 'Step 2 of 3' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })
})
