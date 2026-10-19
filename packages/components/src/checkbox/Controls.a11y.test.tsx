import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Checkbox } from './Checkbox'
import { Radio, RadioGroup } from '../radio/Radio'
import { Switch } from '../switch/Switch'
import { Slider } from '../slider/Slider'
import { Pagination } from '../pagination/Pagination'
import { Calendar } from '../date-picker/Calendar'
import { expectNoAxeViolations } from '../test/axe'

describe('small controls: touch targets and focus', () => {
  it('checkbox, radio, switch and slider thumb keep their drawn size and gain a 44px hit area', async () => {
    const { getByRole, container } = render(
      <>
        <Checkbox aria-label="Agree" />
        <RadioGroup aria-label="Metal">
          <Radio value="gold" aria-label="Gold" />
        </RadioGroup>
        <Switch aria-label="Notify" />
        <Slider aria-label="Purity" defaultValue={[50]} />
      </>
    )
    for (const el of [
      getByRole('checkbox', { name: 'Agree' }),
      getByRole('radio', { name: 'Gold' }),
      getByRole('switch', { name: 'Notify' }),
      getByRole('slider', { name: 'Purity' }),
    ]) {
      expect(el.className).toContain('hit-area')
      expect(el.className).toContain('focus-ring')
    }
    expect(getByRole('checkbox').className).toContain('size-4')
    await expectNoAxeViolations(container)
  })

  it('pagination buttons each hit only their own box: no overlay onto a neighbour', () => {
    const { getAllByRole } = render(<Pagination page={2} pageCount={5} onPageChange={() => {}} />)
    for (const button of getAllByRole('button')) expect(button.className).not.toContain('hit-area')
  })

  it('calendar nav keeps a 44px hit area', () => {
    const { container } = render(
      <>
        <Calendar mode="single" defaultMonth={new Date(2026, 0, 1)} />
      </>
    )
    const nav = container.querySelectorAll(
      '.rdp-button_previous, .rdp-button_next, button[aria-label*="month" i]'
    )
    expect(nav.length).toBeGreaterThan(0)
    for (const button of nav) expect(button.className).toContain('hit-area')
  })
})
