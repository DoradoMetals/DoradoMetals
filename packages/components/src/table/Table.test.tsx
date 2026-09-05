import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table'
import { axeViolations } from '../test/axe'

function renderTable(onSort = () => {}) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sorted="asc" onSort={onSort}>
            Date
          </TableHead>
          <TableHead numeric>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell primary>2026-08-30</TableCell>
          <TableCell numeric>$120.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

describe('Table', () => {
  it('is a real table, and axe finds nothing', async () => {
    const { container } = renderTable()
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('th').length).toBe(2)
    expect(container.querySelector('th')?.getAttribute('scope')).toBe('col')
    expect(await axeViolations(container)).toEqual([])
  })

  it('the sorted column says so on the th, and the button fires', () => {
    const onSort = vi.fn()
    const { container, getByRole } = renderTable(onSort)
    const th = container.querySelector('th[aria-sort="ascending"]')
    expect(th).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /Date/ }))
    expect(onSort).toHaveBeenCalled()
  })

  it('aria-sort cycles through the three states as the sorted prop changes, driven by props not internal state', () => {
    const { container, rerender } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sorted={null} onSort={() => {}}>
              Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('th')?.getAttribute('aria-sort')).toBe('none')

    rerender(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sorted="asc" onSort={() => {}}>
              Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('th')?.getAttribute('aria-sort')).toBe('ascending')

    rerender(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sorted="desc" onSort={() => {}}>
              Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('th')?.getAttribute('aria-sort')).toBe('descending')
  })

  it('a column with no onSort carries no aria-sort at all', () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('th')?.hasAttribute('aria-sort')).toBe(false)
  })

  it("uses the drawing's named sort glyphs, not a generic arrow (56:82, node 510:26)", () => {
    const { container, rerender } = renderTable()
    expect(container.querySelector('svg.lucide-arrow-up-narrow-wide')).toBeTruthy()
    rerender(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sorted="desc" onSort={() => {}}>
              Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('svg.lucide-arrow-down-wide-narrow')).toBeTruthy()
  })

  it("renders the caller's filter slot in the funnel's position", () => {
    const { getByRole } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead filter={<button aria-label="Filter column">Filter</button>}>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(getByRole('button', { name: /filter column/i })).toBeTruthy()
  })

  it('a column with no filter slot renders nothing in its place', () => {
    const { queryByRole } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(queryByRole('button', { name: /filter column/i })).toBeNull()
  })

  it('the filter slot sits alongside the sort button, both inside the same th', () => {
    const { container, getByRole } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              sorted={null}
              onSort={() => {}}
              filter={<button aria-label="Filter column">Filter</button>}
            >
              Item
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    const th = container.querySelector('th')!
    expect(within(th).getByRole('button', { name: /Item/ })).toBeTruthy()
    expect(within(th).getByRole('button', { name: /filter column/i })).toBeTruthy()
    expect(getByRole('button', { name: /filter column/i }).closest('th')).toBe(th)
  })

  it("onFilter renders the drawn funnel with aria-pressed (56:82: 'TableHead onFilter/filtered renders the funnel with aria-pressed')", () => {
    const onFilter = vi.fn()
    const { container, getByRole } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead filtered onFilter={onFilter}>
              Item
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )
    expect(container.querySelector('svg.lucide-funnel')).toBeTruthy()
    const filterButton = getByRole('button', { name: /filter/i })
    expect(filterButton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(filterButton)
    expect(onFilter).toHaveBeenCalled()
  })

  it('no onFilter means no funnel button at all', () => {
    const { container } = renderTable()
    expect(container.querySelector('svg.lucide-funnel')).toBeNull()
  })

  it('a selected row is expressed in a way assistive tech can read, and axe finds nothing', async () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow selected>
            <TableCell primary>gold-chain-photo.jpg</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const row = container.querySelector('tbody tr')
    expect(row?.getAttribute('aria-selected')).toBe('true')
    expect(row?.getAttribute('data-state')).toBe('selected')
    expect(await axeViolations(container)).toEqual([])
  })

  it('an unselected row carries no aria-selected', () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell primary>gold-chain-photo.jpg</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    expect(container.querySelector('tbody tr')?.hasAttribute('aria-selected')).toBe(false)
  })
})
