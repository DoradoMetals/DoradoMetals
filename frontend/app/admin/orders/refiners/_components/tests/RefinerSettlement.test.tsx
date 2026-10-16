import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import type {
  Action,
  RefiningFineOz,
  RefiningOrderRead,
  RefiningPricing,
  RefiningSettlementState,
} from '@dorado/contracts'

import { RefinerSettlement, type RefinerSettlementProps } from '../RefinerSettlement'

const fine: RefiningFineOz[] = [
  {
    metal_id: 'Gold',
    estimated_content: 4.241,
    settled_content: 4.3,
    variance: 0.059,
    pool_oz: 4.1,
  },
  {
    metal_id: 'Silver',
    estimated_content: 38.921,
    settled_content: 39.323,
    variance: 0.402,
    pool_oz: 37.5,
  },
]

function order(
  state: RefiningSettlementState,
  over: Partial<Record<string, unknown>> = {},
  actions: Action[] = []
): RefiningOrderRead {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    number: 'RS-2493',
    settlement_type: 'paid',
    settled_at: state === 'Settled' ? '2026-10-02T15:00:00Z' : null,
    cancelled_at: state === 'Cancelled' ? '2026-10-02T15:00:00Z' : null,
    assay_lab: 'Elemetal · Dallas',
    dispute_note: null,
    fine_oz: fine,
    lots: Array.from({ length: 5 }, () => ({ returned_at: null })),
    settlement: {
      state,
      settled_lots: state === 'Partial' ? 3 : state === 'Settled' ? 5 : 0,
      lot_count: 5,
    },
    actions,
    ...over,
  } as unknown as RefiningOrderRead
}

const pricing = {
  expected_settlement: 14120,
  settled_amount: 8640,
} as unknown as RefiningPricing

const settle: Action = { name: 'settle', confirm: null, override: null }
const resolve: Action = { name: 'resolve_dispute', confirm: 'Clear the dispute', override: null }

function show(extra: Partial<RefinerSettlementProps> = {}) {
  const handlers = {
    onRecordSettlement: vi.fn(),
    onResolveDispute: vi.fn(),
    onSettlementTypeChange: vi.fn(),
    onRetry: vi.fn(),
  }
  const utils = render(<RefinerSettlement {...handlers} {...extra} />)
  return { ...utils, ...handlers }
}

const value = (label: string) =>
  (screen.getByText(label).nextElementSibling as HTMLElement).textContent

describe('RefinerSettlement (742:20760 desktop, 743:20841 mobile)', () => {
  it('Pending, Paid, Loaded (742:20483): Pending Assay, Record settlement, chips, facts per metal', () => {
    const { onRecordSettlement, onSettlementTypeChange } = show({
      order: order('Pending', {}, [settle]),
      pricing,
    })
    expect(screen.getByText('Pending Assay')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Record settlement' }))
    expect(onRecordSettlement).toHaveBeenCalled()
    const paid = screen.getByRole('button', { name: 'Paid at settlement' })
    const pooled = screen.getByRole('button', { name: 'Pooled' })
    expect(paid.getAttribute('aria-pressed')).toBe('true')
    expect((pooled as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(pooled)
    expect(onSettlementTypeChange).toHaveBeenCalledWith('pooled')
    expect(value('Estimated fine oz')).toBe('4.241 oz gold38.921 oz silver')
    expect(value('Settled fine oz')).toBe('Pending')
    expect(value('Variance')).toBe('Pending')
    expect(value('Assay lab')).toBe('Elemetal · Dallas')
    expect(value('Expected settlement')).toBe('$14,120.00')
  })

  it('never sums ounces across metals', () => {
    show({ order: order('Settled'), pricing })
    expect(screen.queryByText(/43\.\d{3} oz/)).toBeNull()
  })

  it('Pending, Pooled, Loaded (742:20529): Credited to pool reads — before settle', () => {
    show({
      order: order(
        'Pending',
        { settlement_type: 'pooled', fine_oz: fine.map((r) => ({ ...r, pool_oz: null })) },
        [settle]
      ),
    })
    expect(screen.getByRole('button', { name: 'Pooled' }).getAttribute('aria-pressed')).toBe('true')
    expect(value('Credited to pool')).toBe('—')
    expect(screen.queryByText('Expected settlement')).toBeNull()
  })

  it('Settled, Paid (742:20573): Settled badge, no primary, chips disabled, settled figures', () => {
    show({ order: order('Settled'), pricing })
    expect(screen.getByText('Settled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record settlement' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Pooled' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(value('Settled fine oz')).toBe('4.300 oz gold39.323 oz silver')
    expect(value('Variance')).toBe('0.059 oz gold0.402 oz silver')
  })

  it('Settled, Pooled (742:20621): credited to pool per metal', () => {
    show({ order: order('Settled', { settlement_type: 'pooled' }) })
    expect(value('Credited to pool')).toBe('4.100 oz gold37.500 oz silver')
  })

  it('Partial (1204:26123): "3 of 5 settled", Pending on 2 lots, Settled of $14,120.00', () => {
    show({ order: order('Partial', {}, [settle]), pricing })
    expect(screen.getByText('3 of 5 settled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record settlement' })).toBeTruthy()
    expect(value('Variance')).toBe('Pending on 2 lots')
    expect(value('Settled of $14,120.00')).toBe('$8,640.00')
  })

  it('Disputed (1204:26174): danger badge, note, Resolve dispute', () => {
    const { onResolveDispute } = show({
      order: order(
        'Disputed',
        { dispute_note: 'Our XRF reads 58.3% on 2481-A; Elemetal reports 54.1%.' },
        [settle, resolve]
      ),
      pricing,
    })
    expect(screen.getByText('Disputed')).toBeTruthy()
    expect(screen.getByText('Assay disputed')).toBeTruthy()
    expect(screen.getByText('Our XRF reads 58.3% on 2481-A; Elemetal reports 54.1%.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record settlement' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resolve dispute' }))
    expect(onResolveDispute).toHaveBeenCalled()
    expect(value('Settled fine oz')).toBe('Pending')
  })

  it('Cancelled (1204:26235): lots back on hand, dashes, chips disabled', () => {
    show({ order: order('Cancelled'), pricing })
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.getByText('Batch cancelled')).toBeTruthy()
    expect(
      screen.getByText('RS-2493 was cancelled before it shipped. Its 5 lots are back on hand.')
    ).toBeTruthy()
    expect(value('Settled fine oz')).toBe('—')
    expect(value('Variance')).toBe('—')
    expect(value('Expected settlement')).toBe('—')
    expect(
      (screen.getByRole('button', { name: 'Paid at settlement' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('Cancelled after arrival says the lots are coming back', () => {
    show({
      order: order('Cancelled', { lots: [{ returned_at: '2026-10-01T00:00:00Z' }] }),
    })
    expect(
      screen.getByText(/after the metal reached the refiner. Its 1 lot is coming back./)
    ).toBeTruthy()
  })

  it.each(['desktop', 'mobile'] as const)('Empty (%s) (1204:23546 / 1204:23687)', (layout) => {
    show({ order: order('Pending', {}, [settle]), content: 'empty', layout })
    expect(screen.getByText('No settlement yet')).toBeTruthy()
    expect(screen.queryByText('Pending Assay')).toBeNull()
  })

  it.each(['desktop', 'mobile'] as const)('Loading (%s) (1204:23592 / 1204:23733)', (layout) => {
    const { container } = show({ content: 'loading', layout })
    expect(screen.getByRole('status', { name: 'Loading settlement' })).toBeTruthy()
    expect(container.querySelectorAll('.bg-secondary').length).toBe(3)
  })

  it.each(['desktop', 'mobile'] as const)('Error (%s) (1204:23634 / 1204:23775)', (layout) => {
    const { onRetry } = show({ content: 'error', layout })
    expect(screen.getByText('Couldn’t load settlement')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('mobile Loaded (743:20563) carries the layout', () => {
    const { container } = show({ order: order('Pending', {}, [settle]), layout: 'mobile', pricing })
    expect(container.querySelector('[data-layout="mobile"][data-state="Pending"]')).toBeTruthy()
  })
})
