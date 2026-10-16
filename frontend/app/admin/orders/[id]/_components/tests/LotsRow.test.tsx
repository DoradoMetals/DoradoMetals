import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Table, TableBody } from '@dorado/components'

import { LotsRow } from '../LotsRow'
import { action, bullionLot, scrapLot, shortLot } from './detailFixtures'

const inTable = (node: React.ReactNode) =>
  render(
    <Table>
      <TableBody>{node}</TableBody>
    </Table>
  )

describe('LotsRow', () => {
  test('Type=Scrap: dash for qty, weight, purity and premium inputs with units, price', () => {
    inTable(<LotsRow lot={scrapLot} kind="scrap" />)
    expect(screen.getByRole('row').getAttribute('data-type')).toBe('scrap')
    expect((screen.getByLabelText('Gross, 14 Karat Gold') as HTMLInputElement).value).toBe('142.5')
    expect((screen.getByLabelText('Net, 14 Karat Gold') as HTMLInputElement).value).toBe('139.22')
    expect(screen.getAllByText('g')).toHaveLength(2)
    expect(screen.getAllByText('%')).toHaveLength(2)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('$5,102.40')).toBeTruthy()
  })

  test('Type=Bullion: qty input, dashes for weight and purity', () => {
    inTable(<LotsRow lot={bullionLot} kind="scrap" />)
    expect(screen.getByRole('row').getAttribute('data-type')).toBe('bullion')
    expect((screen.getByLabelText('Qty, 1 oz Gold American Eagle') as HTMLInputElement).value).toBe(
      '2'
    )
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  test('Stock=Short: Allocate from inventory calls back with the order lot id', () => {
    const onAllocate = vi.fn()
    inTable(<LotsRow lot={shortLot} kind="bullion" onAllocate={onAllocate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allocate from inventory' }))
    expect(onAllocate).toHaveBeenCalledWith(shortLot.id)
  })

  test('selection reports through the checkbox', () => {
    const onSelectedChange = vi.fn()
    inTable(<LotsRow lot={scrapLot} kind="scrap" onSelectedChange={onSelectedChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 14 Karat Gold' }))
    expect(onSelectedChange).toHaveBeenCalledWith(true)
  })

  test('a lot link goes to the lot when lotHref is given', () => {
    inTable(<LotsRow lot={scrapLot} kind="scrap" lotHref={(id) => `/admin/lots/${id}`} />)
    expect(screen.getByRole('link', { name: 'Lot 2481-A' }).getAttribute('href')).toBe(
      `/admin/lots/${scrapLot.lot_id}`
    )
  })

  test('premium edits go back as a ratio', () => {
    const onEdit = vi.fn()
    inTable(<LotsRow lot={scrapLot} kind="scrap" editable onEdit={onEdit} />)
    const premium = screen.getByLabelText('Premium, 14 Karat Gold')
    fireEvent.change(premium, { target: { value: '94' } })
    fireEvent.blur(premium)
    expect(onEdit).toHaveBeenCalledWith(scrapLot.id, { premium: 0.94 })
    expect(action('edit_lots').name).toBe('edit_lots')
  })

  test('Lots Row Mobile: name and price over labelled fields; bullion and short variants', () => {
    const { unmount } = render(<LotsRow lot={scrapLot} kind="scrap" layout="mobile" />)
    expect(screen.getByText('14 Karat Gold')).toBeTruthy()
    for (const label of ['Gross', 'Net', 'Purity', 'Premium'])
      expect(screen.getByLabelText(label)).toBeTruthy()
    unmount()
    render(<LotsRow lot={shortLot} kind="bullion" layout="mobile" />)
    expect(screen.getByLabelText('Qty')).toBeTruthy()
    expect(screen.queryByLabelText('Gross')).toBeNull()
    expect(screen.getByRole('button', { name: 'Allocate from inventory' })).toHaveProperty(
      'disabled',
      true
    )
  })

  test('Lots Row Mobile: the select checkbox is off by default and shows on Show select', () => {
    const onSelectedChange = vi.fn()
    const { unmount } = render(
      <LotsRow lot={scrapLot} kind="scrap" layout="mobile" onSelectedChange={onSelectedChange} />
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
    unmount()
    render(
      <LotsRow
        lot={scrapLot}
        kind="scrap"
        layout="mobile"
        showSelect
        onSelectedChange={onSelectedChange}
      />
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onSelectedChange).toHaveBeenCalledWith(true)
  })
})
