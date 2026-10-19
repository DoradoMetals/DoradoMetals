import { describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { DateRangePicker, type DateRange } from './DateRangePicker'
import { expectNoAxeViolations } from '../test/axe'

const Y = new Date().getFullYear()
const MONTH = new Date(Y, 9, 1)

function Controlled({ initial, disabled }: { initial?: DateRange; disabled?: boolean }) {
  const [value, setValue] = React.useState<DateRange | undefined>(initial)
  return (
    <DateRangePicker
      label="Received"
      value={value}
      onValueChange={setValue}
      defaultMonth={MONTH}
      disabled={disabled}
    />
  )
}

describe('Date Picker (Library, 2026-10-19)', () => {
  it('Default (1208:573): label above, calendar segment, hairline divider, "Any time", no chevron', async () => {
    const { getByText, getByRole, container } = render(<Controlled />)
    expect(getByText('Received').tagName).toBe('LABEL')
    const trigger = getByRole('button', { name: /Received/ })
    expect(trigger.textContent).toContain('Any time')
    const segment = trigger.querySelector('[data-part="calendar-segment"]') as HTMLElement
    expect(segment.className).toContain('bg-card')
    expect(segment.querySelector('svg.lucide-calendar-arrow-down')).toBeTruthy()
    const divider = trigger.querySelector('[data-part="divider"]') as HTMLElement
    expect(divider.className).toContain('bg-border-strong')
    expect(trigger.querySelector('svg.lucide-chevron-down')).toBeNull()
    await expectNoAxeViolations(container)
  })

  it('Filled (1208:633) shows the range with the year once at the end', () => {
    const { getByRole } = render(
      <Controlled initial={{ from: new Date(Y, 9, 1), to: new Date(Y, 9, 19) }} />
    )
    expect(getByRole('button', { name: /Received/ }).textContent).toContain(`Oct 1 – Oct 19, ${Y}`)
  })

  it('Disabled (1208:853) is muted and does not open', () => {
    const { getByRole, queryByRole } = render(<Controlled disabled />)
    const trigger = getByRole('button', { name: /Received/ }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.querySelector('[data-part="calendar-segment"]')!.className).toContain('bg-muted')
    expect(trigger.querySelector('[data-part="value"]')!.className).toContain(
      'text-muted-foreground'
    )
    fireEvent.click(trigger)
    expect(queryByRole('dialog')).toBeNull()
  })

  it('Open: the Calendar in range mode with Clear and Apply; Apply commits the draft', () => {
    const { getByRole } = render(<Controlled />)
    fireEvent.click(getByRole('button', { name: /Received/ }))
    const panel = getByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: /October 6/ }))
    fireEvent.click(within(panel).getByRole('button', { name: /October 9/ }))
    const middle = within(panel).getByRole('button', { name: /October 7/ }).parentElement!
    expect(middle.className).toContain('bg-highest')
    const end = within(panel).getByRole('button', { name: /October 9/ }).parentElement!
    expect(end.className).toContain('[&>button]:bg-primary')
    expect(end.className).toContain('[&>button]:text-primary-foreground')
    expect(
      within(panel).queryAllByRole('button', { name: /^(Last \d|This (week|month|year))/ })
    ).toHaveLength(0)
    fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }))
    expect(getByRole('button', { name: /Received/ }).textContent).toContain(`Oct 6 – Oct 9, ${Y}`)
  })

  it('Clear empties the range back to "Any time"', () => {
    const { getByRole } = render(
      <Controlled initial={{ from: new Date(Y, 9, 6), to: new Date(Y, 9, 12) }} />
    )
    fireEvent.click(getByRole('button', { name: /Received/ }))
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Clear' }))
    expect(getByRole('button', { name: /Received/ }).textContent).toContain('Any time')
  })

  it('on open focus enters the panel on the start day; Escape closes and returns it to the trigger', () => {
    const { getByRole, queryByRole } = render(
      <Controlled initial={{ from: new Date(Y, 9, 6), to: new Date(Y, 9, 12) }} />
    )
    const trigger = getByRole('button', { name: /Received/ })
    fireEvent.click(trigger)
    const panel = getByRole('dialog')
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(/October 6/)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('Apply returns focus to the trigger', () => {
    const { getByRole } = render(<Controlled />)
    const trigger = getByRole('button', { name: /Received/ })
    fireEvent.click(trigger)
    expect(getByRole('dialog').contains(document.activeElement)).toBe(true)
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Apply' }))
    expect(document.activeElement).toBe(trigger)
  })
})
