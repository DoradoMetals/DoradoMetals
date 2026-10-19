import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { TimePicker } from './TimePicker'
import { expectNoAxeViolations } from '../test/axe'

const groups = [
  {
    label: 'Morning',
    slots: [
      { value: '09:00', label: '9:00 AM' },
      { value: '10:00', label: '10:00 AM', available: false },
      { value: '11:00', label: '11:00 AM' },
    ],
  },
  { label: 'Afternoon', slots: [{ value: '13:00', label: '1:00 PM' }] },
]

describe('TimePicker accessibility', () => {
  it('one tab stop: the chosen slot, or the first open slot when none is chosen', async () => {
    const { getAllByRole, rerender, container } = render(
      <TimePicker groups={groups} value="11:00" onValueChange={() => {}} />
    )
    const stops = () => getAllByRole('radio').map((r) => r.getAttribute('tabindex'))
    expect(stops()).toEqual(['-1', '-1', '0', '-1'])
    rerender(<TimePicker groups={groups} value={null} onValueChange={() => {}} />)
    expect(stops()).toEqual(['0', '-1', '-1', '-1'])
    await expectNoAxeViolations(container)
  })

  it('arrow keys skip sold-out slots and choose; Home and End reach the ends', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <TimePicker groups={groups} value="09:00" onValueChange={onValueChange} />
    )
    const first = getByRole('radio', { name: '9:00 AM' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(getByRole('radio', { name: '11:00 AM' }))
    expect(onValueChange).toHaveBeenLastCalledWith('11:00')
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' })
    expect(onValueChange).toHaveBeenLastCalledWith('13:00')
    const calls = onValueChange.mock.calls.length
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenCalledTimes(calls)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect(onValueChange).toHaveBeenLastCalledWith('09:00')
  })

  it('each time-of-day group is a named group', () => {
    const { getByRole } = render(
      <TimePicker groups={groups} value={null} onValueChange={() => {}} />
    )
    expect(getByRole('group', { name: 'Morning' })).toBeTruthy()
    expect(getByRole('group', { name: 'Afternoon' })).toBeTruthy()
  })
})
