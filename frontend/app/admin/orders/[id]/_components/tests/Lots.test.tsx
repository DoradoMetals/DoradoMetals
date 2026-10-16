import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { Lots } from '../Lots'
import { action, bullionLot, scrapLot } from './detailFixtures'

const lots = [scrapLot, bullionLot]

describe('Lots', () => {
  test('Kind=Scrap, Open: a purchase draws every column, the rows and their prices', () => {
    render(<Lots direction="purchase" lots={lots} actions={[]} />)
    const table = screen.getByRole('table', { name: 'Lots' })
    for (const head of ['Item', 'Qty', 'Gross', 'Net', 'Purity', 'Premium', 'Price']) {
      expect(within(table).getByRole('columnheader', { name: head })).toBeTruthy()
    }
    expect(screen.queryByText(/melt/i)).toBeNull()
    expect(screen.getByText('14 Karat Gold')).toBeTruthy()
    expect(screen.getByText('Lot 2481-A')).toBeTruthy()
    expect(screen.getByText('$5,102.40')).toBeTruthy()
    expect(screen.getByText('$4,701.84')).toBeTruthy()
    expect((screen.getByLabelText('Purity, 14 Karat Gold') as HTMLInputElement).value).toBe('56.3')
    expect((screen.getByLabelText('Premium, 14 Karat Gold') as HTMLInputElement).value).toBe('92')
  })

  test('Kind=Bullion: a sale draws only Qty, Premium and Price', () => {
    render(<Lots direction="sale" lots={[bullionLot]} actions={[]} />)
    const table = screen.getByRole('table', { name: 'Lots' })
    expect(within(table).queryByRole('columnheader', { name: 'Gross' })).toBeNull()
    expect(within(table).getByRole('columnheader', { name: 'Premium' })).toBeTruthy()
    expect((screen.getByLabelText('Qty, 1 oz Gold American Eagle') as HTMLInputElement).value).toBe(
      '2'
    )
  })

  test('Selection=None: add, combine and remove are disabled until actions[] offers them', () => {
    render(<Lots direction="purchase" lots={lots} actions={[]} onAdd={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add lot' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Combine lots' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Remove lots' })).toHaveProperty('disabled', true)
  })

  test('Selection=Some: combine and remove go live, remove asks first and keeps the lot', () => {
    const onRemove = vi.fn()
    const onCombine = vi.fn()
    const onSelectedChange = vi.fn()
    render(
      <Lots
        direction="purchase"
        lots={lots}
        actions={[action('edit_lots'), action('combine_lots'), action('remove_lots')]}
        selected={[scrapLot.id]}
        onSelectedChange={onSelectedChange}
        onCombine={onCombine}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Combine lots' }))
    expect(onCombine).toHaveBeenCalledWith([scrapLot.id])
    fireEvent.click(screen.getByRole('button', { name: 'Remove lots' }))
    expect(screen.getByText('Remove from this order?')).toBeTruthy()
    expect(screen.getByText('The lot is kept.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith([scrapLot.id], { reason: '' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all lots' }))
    expect(onSelectedChange).toHaveBeenCalledWith([scrapLot.id, bullionLot.id])
  })

  test('the confirm reason from actions[] becomes the remove dialog body', () => {
    render(
      <Lots
        direction="purchase"
        lots={lots}
        actions={[action('remove_lots', { confirm: '1 lot has photos' })]}
        selected={[scrapLot.id]}
        onRemove={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove lots' }))
    expect(screen.getByText('1 lot has photos')).toBeTruthy()
  })

  test('an edit commits an OrderLotPatch, purity sent back as a ratio', () => {
    const onEdit = vi.fn()
    render(
      <Lots direction="purchase" lots={lots} actions={[action('edit_lots')]} onEdit={onEdit} />
    )
    const purity = screen.getByLabelText('Purity, 14 Karat Gold')
    fireEvent.change(purity, { target: { value: '58.1' } })
    fireEvent.blur(purity)
    expect(onEdit).toHaveBeenCalledWith(scrapLot.id, { purity: 0.581 })
  })

  test('inputs are read-only when edit_lots is not offered', () => {
    render(<Lots direction="purchase" lots={lots} actions={[]} />)
    expect(screen.getByLabelText('Purity, 14 Karat Gold')).toHaveProperty('readOnly', true)
  })

  test('Open=False: the header carries the lot count', () => {
    render(<Lots direction="purchase" lots={lots} actions={[]} defaultOpen={false} />)
    expect(screen.getByText('2 lots')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('Lots / Mobile: card rows with labelled fields, a checkbox per row, items count', () => {
    const { unmount } = render(
      <Lots direction="purchase" lots={lots} actions={[]} layout="mobile" />
    )
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByLabelText('Gross')).toBeTruthy()
    expect(screen.getByLabelText('Qty')).toBeTruthy()
    unmount()
    render(
      <Lots direction="purchase" lots={lots} actions={[]} layout="mobile" defaultOpen={false} />
    )
    expect(screen.getByText('2 items')).toBeTruthy()
  })

  test('Content=Empty keeps only the add button', () => {
    render(<Lots direction="purchase" lots={[]} actions={[action('add_lot')]} onAdd={() => {}} />)
    expect(screen.getByText('No lots yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add lot' })).toHaveProperty('disabled', false)
    expect(screen.queryByRole('button', { name: 'Combine lots' })).toBeNull()
  })

  test('Content=Loading and Content=Error', () => {
    const onRetry = vi.fn()
    const { unmount } = render(
      <Lots direction="purchase" lots={undefined} actions={[]} content="loading" />
    )
    expect(screen.getByRole('status', { name: 'Loading lots' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add lot' })).toBeNull()
    unmount()
    render(
      <Lots direction="purchase" lots={undefined} actions={[]} content="error" onRetry={onRetry} />
    )
    expect(screen.getByText('Couldn’t load lots')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  test('Lots / Adding Lot: the adding slot replaces the title actions', () => {
    render(<Lots direction="sale" lots={lots} actions={[]} adding={<span>adding slot</span>} />)
    expect(screen.getByText('adding slot')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add lot' })).toBeNull()
  })

  test('askRemoveReason: the unlink needs a reason of 10 characters and sends it as the body', () => {
    const onRemove = vi.fn()
    render(
      <Lots
        direction="purchase"
        lots={lots}
        actions={[action('remove_lots')]}
        selected={[scrapLot.id]}
        onRemove={onRemove}
        askRemoveReason
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove lots' }))
    const confirm = screen.getByRole('button', { name: 'Remove' })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Entered on the wrong order' },
    })
    expect(confirm).toHaveProperty('disabled', false)
    fireEvent.click(confirm)
    expect(onRemove).toHaveBeenCalledWith([scrapLot.id], { reason: 'Entered on the wrong order' })
  })

  test('Lots / Mobile, Selection=Some: a row checkbox selects the lot and opens remove', () => {
    const onSelectedChange = vi.fn()
    const onRemove = vi.fn()
    const { rerender } = render(
      <Lots
        direction="purchase"
        lots={lots}
        actions={[action('remove_lots')]}
        layout="mobile"
        selected={[]}
        onSelectedChange={onSelectedChange}
        onRemove={onRemove}
      />
    )
    expect(screen.getByRole('button', { name: 'Remove lots' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 14 Karat Gold' }))
    expect(onSelectedChange).toHaveBeenCalledWith([scrapLot.id])
    rerender(
      <Lots
        direction="purchase"
        lots={lots}
        actions={[action('remove_lots')]}
        layout="mobile"
        selected={[scrapLot.id]}
        onSelectedChange={onSelectedChange}
        onRemove={onRemove}
      />
    )
    expect(
      screen.getByRole('checkbox', { name: 'Select 14 Karat Gold' }).getAttribute('aria-checked')
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Remove lots' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith([scrapLot.id], { reason: '' })
  })

  test('Lots / Mobile, Kind=Bullion: quantity and premium only', () => {
    render(<Lots direction="sale" lots={[bullionLot]} actions={[]} layout="mobile" />)
    expect(screen.getByLabelText('Qty')).toBeTruthy()
    expect(screen.getByLabelText('Premium')).toBeTruthy()
    expect(screen.queryByLabelText('Purity')).toBeNull()
  })
})
