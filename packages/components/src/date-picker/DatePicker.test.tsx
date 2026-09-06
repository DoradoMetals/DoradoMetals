import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { DatePicker } from './DatePicker'
import { axeViolations } from '../test/axe'

const groups = [{ label: 'Morning', slots: [{ value: '09:00', label: '9:00 AM' }] }]

describe('DatePicker', () => {
  it('date-only renders the calendar alone, and axe finds nothing', async () => {
    const { container } = render(<DatePicker mode="single" defaultMonth={new Date(2026, 7, 1)} />)
    expect(container.querySelector('[role="grid"]')).toBeTruthy()
    expect(container.querySelector('[role="radiogroup"]')).toBe(null)
    expect(await axeViolations(container)).toEqual([])
  })

  it('the time addon joins INSIDE the same card and picking fires', () => {
    const onTimeChange = vi.fn()
    const { container, getByRole } = render(
      <DatePicker
        mode="single"
        defaultMonth={new Date(2026, 7, 1)}
        timeGroups={groups}
        timeValue={null}
        onTimeChange={onTimeChange}
        timeHeading="Thursday, 18 June"
      />
    )

    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('border')
    expect(card.querySelector('[role="grid"]')).toBeTruthy()
    expect(card.querySelector('[role="radiogroup"]')).toBeTruthy()
    fireEvent.click(getByRole('radio', { name: /9:00 AM/ }))
    expect(onTimeChange).toHaveBeenCalledWith('09:00')
  })

  it('Layout=Slim swaps the slot grid for a single Time select (104:438, 2026-09-04)', () => {
    const { container, getByRole } = render(
      <DatePicker
        layout="slim"
        mode="single"
        defaultMonth={new Date(2026, 7, 1)}
        timeGroups={groups}
        timeValue={null}
        timeHeading="Time"
      />
    )
    expect(container.querySelector('[role="grid"]')).toBeTruthy()
    expect(container.querySelector('[role="radiogroup"]')).toBe(null)
    expect(getByRole('combobox')).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).getAttribute('data-layout')).toBe('slim')
  })

  it('Slim with no time groups is the calendar alone - Show time picker off', () => {
    const { container, queryByRole } = render(
      <DatePicker layout="slim" mode="single" defaultMonth={new Date(2026, 7, 1)} />
    )
    expect(container.querySelector('[role="grid"]')).toBeTruthy()
    expect(queryByRole('combobox')).toBe(null)
  })

  it('Stacked is the mobile shape: the times sit under the calendar, 3 across', () => {
    const { container } = render(
      <DatePicker
        layout="stacked"
        mode="single"
        defaultMonth={new Date(2026, 7, 1)}
        timeGroups={groups}
        timeValue={null}
      />
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.className).not.toContain('sm:flex-row')
    expect(container.querySelector('.grid-cols-3')).toBeTruthy()
  })

  it('Side by side stays the default and keeps the two-column slot grid', () => {
    const { container } = render(
      <DatePicker
        mode="single"
        defaultMonth={new Date(2026, 7, 1)}
        timeGroups={groups}
        timeValue={null}
      />
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('data-layout')).toBe('sideBySide')
    expect(card.className).toContain('sm:flex-row')
    expect(container.querySelector('.grid-cols-2')).toBeTruthy()
  })
})
