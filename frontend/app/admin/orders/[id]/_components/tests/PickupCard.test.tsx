import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { PickupCard } from '../PickupCard'
import { button, fulfillment } from './cardFixtures'

const withMove = (
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'PICKED_UP',
  next: string | null,
  over = {}
) =>
  fulfillment('PICKUP', status, {
    actions: {
      set_method: false,
      schedule: true,
      cancel_schedule: true,
      categories: ['PICKUP'],
      transitions: next ? [next] : [],
      moves: next ? [{ name: next, confirm: null, override: null }] : [],
      ...over,
    },
  } as never)

const who = { office: 'Austin office', driver: 'Sam Ortiz', address: '88 Elm St, Austin, TX' }

describe('Pickup (184:2846)', () => {
  it('Scheduled: window, Cancel Pickup, Reschedule, Headed to Pickup', () => {
    const onAction = vi.fn()
    const { container } = render(
      <PickupCard view={withMove('SCHEDULED', 'IN_TRANSIT')} {...who} onAction={onAction} />
    )
    expect(screen.getByText('Scheduled')).toBeTruthy()
    expect(screen.getByText('Window')).toBeTruthy()
    expect(screen.getByText('Sam Ortiz')).toBeTruthy()
    expect(screen.getByText('88 Elm St, Austin, TX')).toBeTruthy()
    for (const label of ['Cancel Pickup', 'Reschedule', 'Headed to Pickup'])
      expect(button(container, label)).toBeTruthy()
    fireEvent.click(button(container, 'Headed to Pickup')!)
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'IN_TRANSIT' }))
  })

  it('In Transit: Mark Picked Up', () => {
    const { container } = render(
      <PickupCard view={withMove('IN_TRANSIT', 'PICKED_UP')} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(button(container, 'Mark Picked Up')).toBeTruthy()
  })

  it('Picked Up: Picked up stamp instead of the window, no actions', () => {
    const { container } = render(
      <PickupCard
        view={withMove('PICKED_UP', null, { schedule: false, cancel_schedule: false })}
        {...who}
        doneAt="2026-09-09T19:12:00Z"
        onAction={() => {}}
      />
    )
    expect(screen.getByText('Picked Up')).toBeTruthy()
    expect(screen.getByText('Picked up')).toBeTruthy()
    expect(screen.queryByText('Window')).toBeNull()
    expect(button(container, 'Reschedule')).toBeUndefined()
    expect(button(container, 'Cancel Pickup')).toBeUndefined()
  })

  it('mobile renders', () => {
    render(
      <PickupCard layout="mobile" view={withMove('SCHEDULED', null)} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('Window')).toBeTruthy()
  })
})
