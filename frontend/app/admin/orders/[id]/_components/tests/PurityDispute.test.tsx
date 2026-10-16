import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { PurityDispute } from '../PurityDispute'
import { action, purityDispute } from './detailFixtures'

const offered = [action('reassay'), action('resolve_dispute')]

describe('PurityDispute', () => {
  test('State=Open: title with the lot, Disputed badge, both figures, reason, Re-assay and Resolve', () => {
    const onReassay = vi.fn()
    const onResolve = vi.fn()
    const { container } = render(
      <PurityDispute
        dispute={purityDispute()}
        lotReference="Lot 2481-A"
        actions={offered}
        onReassay={onReassay}
        onResolve={onResolve}
      />
    )
    expect(screen.getByText('Purity dispute · 2481-A')).toBeTruthy()
    expect(screen.getByText('Disputed').className).toContain('bg-warning-soft')
    expect(container.querySelector('[data-state="open"]')).toBeTruthy()
    expect(screen.getByText('56.3%')).toBeTruthy()
    expect(screen.getByText(/58% \(their assay, /)).toBeTruthy()
    expect(screen.getByText('Customer says the clasp was weighed in with the chain.')).toBeTruthy()
    expect(screen.queryByText('Resolution')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Re-assay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(onReassay).toHaveBeenCalled()
    expect(onResolve).toHaveBeenCalled()
  })

  test('the buttons stay off when actions[] does not offer them, or while pending', () => {
    const { rerender } = render(
      <PurityDispute
        dispute={purityDispute()}
        lotReference="Lot 2481-A"
        actions={[]}
        onReassay={() => {}}
        onResolve={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Re-assay' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Resolve' })).toHaveProperty('disabled', true)
    rerender(
      <PurityDispute
        dispute={purityDispute()}
        lotReference="Lot 2481-A"
        actions={offered}
        pending
        onReassay={() => {}}
        onResolve={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Resolve' })).toHaveProperty('disabled', true)
  })

  test('State=Resolved: Resolved badge, the resolution, no buttons', () => {
    const { container } = render(
      <PurityDispute
        dispute={purityDispute({
          resolution: 'Re-assayed at 57.9%.',
          resolved_at: '2026-10-01T16:00:00Z',
        })}
        lotReference="Lot 2481-A"
        actions={offered}
      />
    )
    expect(screen.getByText('Resolved').className).toContain('bg-success-soft')
    expect(container.querySelector('[data-state="resolved"]')).toBeTruthy()
    expect(screen.getByText('Re-assayed at 57.9%.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
  })

  test('Layout=Mobile stacks the buttons full width', () => {
    render(
      <PurityDispute
        dispute={purityDispute()}
        lotReference="Lot 2481-A"
        actions={offered}
        layout="mobile"
      />
    )
    const row = screen.getByRole('button', { name: 'Resolve' }).parentElement as HTMLElement
    expect(row.className).toContain('flex-col')
    expect(row.className).toContain('w-full')
  })
})
