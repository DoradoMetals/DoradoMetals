import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { HandoffCard, handoffActions } from '../HandoffCard'
import { button, fulfillment } from './cardFixtures'

const move = { name: 'PICKED_UP', confirm: null, override: null }
const view = fulfillment('PICKUP', 'IN_TRANSIT', {
  actions: {
    set_method: false,
    schedule: true,
    cancel_schedule: true,
    categories: ['PICKUP'],
    transitions: ['PICKED_UP'],
    moves: [move],
  },
} as never)
const looks = {
  cancel_schedule: {
    label: 'Cancel Pickup',
    variant: 'secondary' as const,
    intent: 'danger' as const,
  },
  schedule: { label: 'Reschedule', variant: 'secondary' as const },
  PICKED_UP: { label: 'Mark Picked Up', variant: 'primary' as const },
}

describe('HandoffCard (shared by Pickup, Appointment, Drop-off)', () => {
  it('actions come from the view, never the status', () => {
    expect(handoffActions(view).map((a) => a.name)).toEqual([
      'cancel_schedule',
      'schedule',
      'PICKED_UP',
    ])
    expect(
      handoffActions(
        fulfillment('PICKUP', 'PICKED_UP', {
          actions: {
            ...view.actions,
            cancel_schedule: false,
            schedule: false,
            transitions: [],
            moves: [],
          },
        } as never)
      )
    ).toEqual([])
  })

  it('draws title, step badge, facts, note and fires actions', () => {
    const onAction = vi.fn()
    const { container } = render(
      <HandoffCard
        title="Pickup"
        step={{ label: 'In Transit', intent: 'info', note: 'On the way.' }}
        facts={[{ label: 'Driver', value: 'Sam' }]}
        view={view}
        looks={looks}
        onAction={onAction}
      />
    )
    expect(screen.getByText('Pickup')).toBeTruthy()
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(screen.getByText('Sam')).toBeTruthy()
    expect(screen.getByText('On the way.')).toBeTruthy()
    fireEvent.click(button(container, 'Mark Picked Up')!)
    expect(onAction).toHaveBeenCalledWith(move)
  })

  it('mobile renders', () => {
    render(
      <HandoffCard
        layout="mobile"
        title="Pickup"
        step={{ label: 'Scheduled', intent: 'warning', note: 'n' }}
        facts={[]}
        view={view}
        looks={looks}
        onAction={() => {}}
      />
    )
    expect(screen.getByText('Scheduled')).toBeTruthy()
  })
})
