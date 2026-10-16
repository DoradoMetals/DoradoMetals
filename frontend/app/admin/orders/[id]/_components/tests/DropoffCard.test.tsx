import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { DropoffCard } from '../DropoffCard'
import { button, fulfillment } from './cardFixtures'

const view = (status: 'SCHEDULED' | 'IN_TRANSIT' | 'DROPPED_OFF', next: string | null) =>
  fulfillment('DROPOFF', status, {
    actions: {
      set_method: false,
      schedule: false,
      cancel_schedule: status === 'SCHEDULED',
      categories: ['DROPOFF'],
      transitions: next ? [next] : [],
      moves: next ? [{ name: next, confirm: null, override: null }] : [],
    },
  } as never)

const who = {
  refinery: 'Elemetal Refining',
  driver: 'Sam Ortiz',
  address: '1 Dock Rd, Dallas, TX',
  receivedBy: 'R. Patel',
}

describe('Drop-off (319:5963)', () => {
  it('Scheduled: date, address, Cancel Drop-off, Headed to Refinery', () => {
    const { container } = render(
      <DropoffCard view={view('SCHEDULED', 'IN_TRANSIT')} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('Date')).toBeTruthy()
    expect(screen.getByText('1 Dock Rd, Dallas, TX')).toBeTruthy()
    expect(screen.queryByText('R. Patel')).toBeNull()
    expect(button(container, 'Cancel Drop-off')).toBeTruthy()
    expect(button(container, 'Headed to Refinery')).toBeTruthy()
  })

  it('In Transit: Mark Dropped Off', () => {
    const { container } = render(
      <DropoffCard view={view('IN_TRANSIT', 'DROPPED_OFF')} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(button(container, 'Mark Dropped Off')).toBeTruthy()
  })

  it('Dropped Off: dropped-off stamp and received by', () => {
    render(<DropoffCard view={view('DROPPED_OFF', null)} {...who} onAction={() => {}} />)
    expect(screen.getByText('Dropped off')).toBeTruthy()
    expect(screen.getByText('R. Patel')).toBeTruthy()
    expect(screen.queryByText('Drop-off address')).toBeNull()
  })

  it('mobile renders', () => {
    render(
      <DropoffCard layout="mobile" view={view('SCHEDULED', null)} {...who} onAction={() => {}} />
    )
    expect(screen.getByText('Refinery')).toBeTruthy()
  })
})
