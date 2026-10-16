import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import type { RefiningLotView, SettlementParse } from '@dorado/contracts'

import { MatchLinesDrawer, type MatchLinesDrawerProps } from '../MatchLinesDrawer'

const LOT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LOT_E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const lots = [
  { lot_id: LOT_A, lot: { reference: 'RS-2493-A', product_name: null, metal_id: 'Gold' } },
  { lot_id: LOT_C, lot: { reference: 'RS-2493-C', product_name: null, metal_id: 'Silver' } },
  { lot_id: LOT_E, lot: { reference: 'RS-2493-E', product_name: null, metal_id: 'Gold' } },
] as unknown as RefiningLotView[]

const parse: SettlementParse = {
  format: 'elemetal',
  supported: true,
  lines: [
    {
      line_reference: 'ELM-88431',
      unit: 'g',
      metal_id: 'Gold',
      weight: 139,
      purity: 0.581,
      fine_oz: 2.531,
      suggested_lot_id: LOT_A,
      status: 'matched',
    },
    {
      line_reference: 'ELM-88433',
      unit: 'g',
      metal_id: 'Silver',
      weight: 1196,
      purity: 0.92,
      fine_oz: 35.39,
      suggested_lot_id: LOT_C,
      status: 'matched',
    },
    {
      line_reference: 'ELM-88434',
      unit: 'g',
      metal_id: 'Gold',
      weight: 41.2,
      purity: 0.61,
      fine_oz: 0.808,
      suggested_lot_id: null,
      status: 'unmatched',
    },
    {
      line_reference: 'ELM-88435',
      unit: 'g',
      metal_id: 'Gold',
      weight: 12,
      purity: 0.33,
      fine_oz: 0.127,
      suggested_lot_id: null,
      status: 'extra',
    },
  ],
  not_on_invoice: [{ lot_id: LOT_E, reference: 'Lot 2488-A', fine_oz: 4.199 }],
}

function open(extra: Partial<MatchLinesDrawerProps> = {}) {
  const onApply = vi.fn()
  const setOpen = vi.fn()
  const onRetry = vi.fn()
  render(
    <MatchLinesDrawer
      open
      setOpen={setOpen}
      parse={parse}
      lots={lots}
      onApply={onApply}
      onRetry={onRetry}
      {...extra}
    />
  )
  return { onApply, setOpen, onRetry }
}

const panel = () => screen.getByRole('dialog')

describe('MatchLinesDrawer (1160:22869 / 1160:23348, bodies 1047:22078 / 1048:31893)', () => {
  it('desktop MD: title, four sections in order, line figures, Cancel and Apply matches', () => {
    open()
    expect(within(panel()).getByText('Match settlement lines')).toBeTruthy()
    const eyebrows = [...panel().querySelectorAll('section p.eyebrow')].map((p) => p.textContent)
    expect(eyebrows).toEqual(['MATCHED', 'UNMATCHED', 'NOT ON INVOICE', 'EXTRA ON INVOICE'])
    const matched = screen.getByRole('region', { name: 'Matched' })
    expect(within(matched).getByText('ELM-88431')).toBeTruthy()
    expect(within(matched).getByText('139.0 g')).toBeTruthy()
    expect(within(matched).getByText('58.1%')).toBeTruthy()
    expect(within(matched).getByText('2.531 oz')).toBeTruthy()
    expect(within(matched).getAllByText('RS-2493-A · Gold').length).toBeGreaterThan(0)
    const unmatched = screen.getByRole('region', { name: 'Unmatched' })
    expect(within(unmatched).getByText('Choose a lot')).toBeTruthy()
    const missing = screen.getByRole('region', { name: 'Not on invoice' })
    expect(within(missing).getByText('Lot 2488-A')).toBeTruthy()
    expect(within(missing).getByText('4.199 oz est.')).toBeTruthy()
    expect(within(missing).getByText('Attach an invoice line')).toBeTruthy()
    const extra = screen.getByRole('region', { name: 'Extra on invoice' })
    expect(within(extra).getByText('0.127 oz')).toBeTruthy()
    expect(within(extra).queryByRole('combobox')).toBeNull()
    expect(within(panel()).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(panel().className).toContain('sm:w-(--drawer-md)')
  })

  it('Apply matches hands back the picks and writes nothing itself', () => {
    const { onApply } = open()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Apply matches' }))
    expect(onApply).toHaveBeenCalledWith([
      { lot_id: LOT_A, line_reference: 'ELM-88431' },
      { lot_id: LOT_C, line_reference: 'ELM-88433' },
    ])
  })

  it('Cancel closes the drawer', () => {
    const { setOpen } = open()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }))
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('mobile Full: rows stack and the footer stacks Apply over Cancel', () => {
    open({ layout: 'mobile' })
    expect(panel().className).toContain('w-full')
    expect(panel().querySelector('[data-layout="mobile"]')).toBeTruthy()
    expect(panel().querySelectorAll('li[data-row].flex-col').length).toBe(5)
    expect(panel().querySelector('.sm\\:flex-col-reverse')).toBeTruthy()
  })

  it('an unsupported format reads an inline message and Apply is disabled', () => {
    open({ parse: { format: null, supported: false, lines: [], not_on_invoice: [] } })
    expect(screen.getByText('This statement format is not supported')).toBeTruthy()
    expect(
      (within(panel()).getByRole('button', { name: 'Apply matches' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('loading shows skeletons; error shows Try again', () => {
    const first = open({ content: 'loading', parse: undefined })
    expect(screen.getByRole('status', { name: 'Reading the statement' })).toBeTruthy()
    expect(first.onApply).not.toHaveBeenCalled()
  })

  it('error offers Try again', () => {
    const { onRetry } = open({ content: 'error', parse: undefined })
    expect(screen.getByText('Couldn’t read the statement')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('a combined lot is one row: one option per refiner lot', () => {
    open()
    const matched = screen.getByRole('region', { name: 'Matched' })
    expect(within(matched).getAllByRole('combobox').length).toBe(2)
  })
})
