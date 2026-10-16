import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { AppointmentCard } from '../AppointmentCard'
import { button, fulfillment } from './cardFixtures'

const view = (status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED', next: string | null) =>
  fulfillment('DIRECT', status, {
    actions: {
      set_method: false,
      schedule: status === 'SCHEDULED',
      cancel_schedule: status === 'SCHEDULED',
      categories: ['DIRECT'],
      transitions: next ? [next] : [],
      moves: next ? [{ name: next, confirm: null, override: null }] : [],
    },
  } as never)

const who = { office: 'Austin office', person: 'Dana Reyes' }

describe('Appointment (195:2924)', () => {
  it('Scheduled: date, time, Cancel Appointment, Reschedule, Check In', () => {
    const { container } = render(
      <AppointmentCard view={view('SCHEDULED', 'IN_PROGRESS')} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('Customer is bringing the items in.')).toBeTruthy()
    for (const label of ['Date', 'Time', 'With']) expect(screen.getByText(label)).toBeTruthy()
    for (const label of ['Cancel Appointment', 'Reschedule', 'Check In'])
      expect(button(container, label)).toBeTruthy()
  })

  it('sale: customer collects the items', () => {
    render(
      <AppointmentCard
        direction="sale"
        view={view('SCHEDULED', null)}
        {...who}
        onAction={() => {}}
      />
    )
    expect(screen.getByText('Customer is collecting the items.')).toBeTruthy()
  })

  it('In Progress: Checked in stamp and Mark Complete', () => {
    const { container } = render(
      <AppointmentCard
        view={view('IN_PROGRESS', 'COMPLETED')}
        {...who}
        doneAt="2026-09-09T15:35:00Z"
        onAction={() => {}}
      />
    )
    expect(screen.getByText('In Progress')).toBeTruthy()
    expect(screen.getByText('Checked in')).toBeTruthy()
    expect(button(container, 'Mark Complete')).toBeTruthy()
  })

  it('Completed: purchase says finalize pricing, sale says handed over', () => {
    const { rerender } = render(
      <AppointmentCard view={view('COMPLETED', null)} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('Items are in-house. Finalize pricing.')).toBeTruthy()
    rerender(
      <AppointmentCard
        direction="sale"
        view={view('COMPLETED', null)}
        {...who}
        onAction={() => {}}
      />
    )
    expect(screen.getByText('Items handed to the customer.')).toBeTruthy()
  })

  it('mobile renders', () => {
    render(
      <AppointmentCard
        layout="mobile"
        view={view('SCHEDULED', null)}
        {...who}
        onAction={() => {}}
      />
    )
    expect(screen.getByText('Scheduled')).toBeTruthy()
  })
})
