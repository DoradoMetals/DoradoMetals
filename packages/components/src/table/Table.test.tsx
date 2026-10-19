import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table'
import { expectNoAxeViolations } from '../test/axe'

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
    await expectNoAxeViolations(container)
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
    await expectNoAxeViolations(container)
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

  it('Table Row 56:33: the name column fills, other columns hug, the header matches the rows', () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead fill>Item</TableHead>
            <TableHead numeric>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell fill primary>
              gold-chain-photo.jpg
            </TableCell>
            <TableCell numeric primary>
              $742.18
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const [thName, thValue] = container.querySelectorAll('th')
    const [tdName, tdValue] = container.querySelectorAll('td')
    expect(thName.className).toContain('w-full')
    expect(tdName.className).toContain('w-full')
    expect(tdName.className).toContain('truncate')
    expect(thValue.className).toContain('whitespace-nowrap')
    expect(tdValue.className).toContain('whitespace-nowrap')
    expect(tdValue.className).toContain('text-right')
    for (const cell of [thName, thValue, tdName, tdValue]) {
      expect(cell.className).toContain('px-2xs-plus')
      expect(cell.className).toContain('first:pl-sm')
      expect(cell.className).toContain('last:pr-sm')
    }
    expect(container.querySelector('thead')!.className).toContain('[&>tr]:h-(--control-md)')
    expect(container.querySelector('tbody')!.className).toContain('[&>tr]:h-(--control-xl)')
  })
})

describe('Table 1101:444, refined 2026-10-19', () => {
  const sortable = (sorted: 'asc' | 'desc' | null) =>
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sorted={sorted} onSort={() => {}}>
              Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>
    )

  it('column heads sit on the card surface (1101:429), never the muted strip', () => {
    const { container } = sortable(null)
    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('[&>tr]:bg-card')
    expect(thead.className).not.toContain('bg-muted')
  })

  it('at rest a sortable head shows muted chevrons-up-down (1171:96)', () => {
    const { container } = sortable(null)
    const icon = container.querySelector('svg.lucide-chevrons-up-down')
    expect(icon).toBeTruthy()
    expect(icon!.getAttribute('class')).toContain('text-muted-foreground')
  })

  it('the active sort is bright: arrow-up-narrow-wide / arrow-down-wide-narrow in primary (1171:101, 1171:106)', () => {
    const asc = sortable('asc').container.querySelector('svg.lucide-arrow-up-narrow-wide')
    expect(asc!.getAttribute('class')).toContain('text-primary')
    const desc = sortable('desc').container.querySelector('svg.lucide-arrow-down-wide-narrow')
    expect(desc!.getAttribute('class')).toContain('text-primary')
  })

  it('rows hover on surface highest and select on surface raised (56:22, 56:32)', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow selected>
            <TableCell>a</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const tbody = container.querySelector('tbody')!
    const row = container.querySelector('tbody tr')!
    expect(tbody.className).toContain('[&>tr:hover]:bg-highest')
    expect(row.className).toContain('data-[state=selected]:bg-surface-raised')
  })

  it('a row rule is inset by the cell padding, never full width, on body and head rows (56:33, 1101:444)', () => {
    const { container } = renderTable()
    const bodyRow = container.querySelector('tbody tr') as HTMLElement
    const headRow = container.querySelector('thead tr') as HTMLElement
    for (const row of [bodyRow, headRow]) {
      expect(row.className).not.toContain('border-b')
      expect(row.getAttribute('data-rule')).toBe('inset')
      expect(row.className).toContain('[&>*]:bg-no-repeat')
      expect(row.className).toContain(
        '[&>*:first-child]:bg-size-[calc(100%-var(--spacing-sm))_1px]'
      )
      expect(row.className).toContain('[&>*:last-child]:bg-size-[calc(100%-var(--spacing-sm))_1px]')
    }
  })

  it('a borderless row draws no rule', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow borderless>
            <TableCell>Only</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const row = container.querySelector('tbody tr') as HTMLElement
    expect(row.getAttribute('data-rule')).toBeNull()
    expect(row.className).not.toContain('bg-no-repeat')
  })
})
