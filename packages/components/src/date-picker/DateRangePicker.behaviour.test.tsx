import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/react'
import * as React from 'react'

import { DateRangePicker, formatRange, type DateRange } from './DateRangePicker'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Controlled({ initial, month }: { initial?: DateRange; month: Date }) {
  const [value, setValue] = React.useState<DateRange | undefined>(initial)
  return (
    <DateRangePicker label="Received" value={value} onValueChange={setValue} defaultMonth={month} />
  )
}

const trigger = (getByRole: (role: string, options: { name: RegExp }) => HTMLElement) =>
  getByRole('button', { name: /Received/ })

describe('DateRangePicker state matrix', () => {
  it.each([
    ['default', {}],
    ['filled', { value: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 19) } }],
    ['disabled', { disabled: true }],
    ['no label', { label: undefined }],
    ['custom placeholder', { placeholder: 'Whenever' }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(
      <DateRangePicker label="Received" value={undefined} onValueChange={() => {}} {...props} />
    )
    expect(container.querySelector('button')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the open panel passes axe', async () => {
    const { user, getByRole, container } = setup(<Controlled month={new Date(2026, 9, 1)} />)
    await user.click(trigger(getByRole))
    await expectNoAxeViolations(container)
  })

  it('the default trigger keeps its class list', () => {
    const { container } = setup(
      <DateRangePicker label="Received" value={undefined} onValueChange={() => {}} />
    )
    expect(classList(container.querySelector('button'))).toMatchInlineSnapshot(`
      [
        "border",
        "border-border",
        "cursor-pointer",
        "disabled:pointer-events-none",
        "flex",
        "focus-visible:border-primary",
        "focus-visible:outline-none",
        "items-stretch",
        "min-h-(--control-lg)",
        "overflow-hidden",
        "rounded-lg",
        "text-left",
        "w-full",
      ]
    `)
  })
})

describe('DateRangePicker behaviour', () => {
  it('controlled: Apply reports the extended draft and the value prop still wins', async () => {
    const onValueChange = vi.fn()
    const value = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) }
    const { user, getByRole } = setup(
      <DateRangePicker label="Received" value={value} onValueChange={onValueChange} />
    )
    await user.click(trigger(getByRole))
    const panel = getByRole('dialog')
    await user.click(within(panel).getByRole('button', { name: /October 10th/ }))
    await user.click(within(panel).getByRole('button', { name: /October 12th/ }))
    await user.click(within(panel).getByRole('button', { name: 'Apply' }))
    const [range] = onValueChange.mock.calls[0] as [DateRange]
    expect(range.from?.getDate()).toBe(1)
    expect(range.to?.getDate()).toBe(12)
    expect(trigger(getByRole).textContent).toContain('Oct 1 – Oct 2, 2026')
  })

  it('opens from the keyboard, walks days with arrows and picks with Enter', async () => {
    const { user, getByRole } = setup(
      <Controlled initial={{ from: new Date(2026, 9, 6) }} month={new Date(2026, 9, 1)} />
    )
    await user.tab()
    expect(trigger(getByRole)).toBe(document.activeElement)
    await user.keyboard('{Enter}')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/October 6/)
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    await user.click(within(getByRole('dialog')).getByRole('button', { name: 'Apply' }))
    expect(trigger(getByRole).textContent).toContain('Oct 6 – Oct 8, 2026')
  })

  it('Space on the trigger opens it and a second press closes it', async () => {
    const { user, getByRole, queryByRole } = setup(<Controlled month={new Date(2026, 9, 1)} />)
    trigger(getByRole).focus()
    await user.keyboard(' ')
    expect(getByRole('dialog')).toBeTruthy()
    await user.click(trigger(getByRole))
    expect(queryByRole('dialog')).toBeNull()
  })

  it('a click outside closes without committing, and reopening drops the draft', async () => {
    const { user, getByRole, queryByRole } = setup(
      <div>
        <p>Outside</p>
        <Controlled month={new Date(2026, 9, 1)} />
      </div>
    )
    await user.click(trigger(getByRole))
    await user.click(within(getByRole('dialog')).getByRole('button', { name: /October 3rd/ }))
    await user.click(getByRole('paragraph'))
    expect(queryByRole('dialog')).toBeNull()
    expect(trigger(getByRole).textContent).toContain('Any time')
    await user.click(trigger(getByRole))
    expect(getByRole('dialog').querySelector('[aria-selected="true"]')).toBeNull()
  })

  it('Apply with no day chosen reports undefined', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <DateRangePicker label="Received" value={undefined} onValueChange={onValueChange} />
    )
    await user.click(trigger(getByRole))
    await user.click(within(getByRole('dialog')).getByRole('button', { name: 'Apply' }))
    expect(onValueChange).toHaveBeenCalledWith(undefined)
  })

  it('a disabled picker does not open from the keyboard', async () => {
    const { user, getByRole, queryByRole } = setup(
      <DateRangePicker label="Received" value={undefined} onValueChange={() => {}} disabled />
    )
    await user.tab()
    await user.keyboard('{Enter}')
    expect(queryByRole('dialog')).toBeNull()
    expect(trigger(getByRole)).toHaveProperty('disabled', true)
  })

  it('a range across the year boundary reads both years', async () => {
    const { user, getByRole } = setup(<Controlled month={new Date(2026, 11, 1)} />)
    await user.click(trigger(getByRole))
    const panel = getByRole('dialog')
    await user.click(within(panel).getByRole('button', { name: /December 30th, 2026/ }))
    await user.click(within(panel).getByRole('button', { name: /next month/i }))
    await user.click(within(panel).getByRole('button', { name: /January 2nd, 2027/ }))
    await user.click(within(panel).getByRole('button', { name: 'Apply' }))
    expect(trigger(getByRole).textContent).toContain('Dec 30, 2026 – Jan 2, 2027')
  })
})

describe('formatRange', () => {
  it('reads nothing, one day, one year and two years', () => {
    expect(formatRange(undefined)).toBeNull()
    expect(formatRange({ from: undefined })).toBeNull()
    expect(formatRange({ from: new Date(2026, 11, 31) })).toBe('Dec 31, 2026')
    expect(formatRange({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 1) })).toBe(
      'Jan 1, 2026'
    )
    expect(formatRange({ from: new Date(2026, 11, 31), to: new Date(2027, 0, 1) })).toBe(
      'Dec 31, 2026 – Jan 1, 2027'
    )
  })
})

describe('DateRangePicker across daylight saving time (America/Chicago)', () => {
  const zone = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Chicago'
  })
  afterAll(() => {
    process.env.TZ = zone
  })

  it('the zone really observes DST in this run', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset()
    )
  })

  it('formats ranges that start or end on a change day by calendar date', () => {
    expect(formatRange({ from: new Date(2026, 2, 7), to: new Date(2026, 2, 9) })).toBe(
      'Mar 7 – Mar 9, 2026'
    )
    expect(formatRange({ from: new Date(2026, 10, 1) })).toBe('Nov 1, 2026')
    expect(formatRange({ from: new Date(2026, 9, 31), to: new Date(2026, 10, 2) })).toBe(
      'Oct 31 – Nov 2, 2026'
    )
  })

  it('picking the spring-forward day keeps it as the 8th at local midnight', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <DateRangePicker
        label="Received"
        value={undefined}
        onValueChange={onValueChange}
        defaultMonth={new Date(2026, 2, 1)}
      />
    )
    await user.click(trigger(getByRole))
    const panel = getByRole('dialog')
    await user.click(within(panel).getByRole('button', { name: /March 8th, 2026/ }))
    await user.click(within(panel).getByRole('button', { name: /March 9th, 2026/ }))
    await user.click(within(panel).getByRole('button', { name: 'Apply' }))
    const [range] = onValueChange.mock.calls[0] as [DateRange]
    expect(range.from?.getDate()).toBe(8)
    expect(range.from?.getHours()).toBe(0)
    expect(range.to?.getDate()).toBe(9)
    expect(within(panel.ownerDocument.body).queryAllByRole('dialog')).toHaveLength(0)
  })

  it('the fall-back month still draws all 30 days of November once', async () => {
    const { user, getByRole } = setup(<Controlled month={new Date(2026, 10, 1)} />)
    await user.click(trigger(getByRole))
    const days = within(getByRole('dialog')).getAllByRole('button', {
      name: /November \d+(st|nd|rd|th), 2026/,
    })
    expect(days).toHaveLength(30)
  })
})
