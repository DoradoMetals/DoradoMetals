import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'

import { DataTable, type DataTableColumn } from './DataTable'
import { expectNoAxeViolations } from '../test/axe'

type Row = { id: string; item: string; purity: string; weight: number }

const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'item', header: 'Item' },
  { accessorKey: 'purity', header: 'Purity' },
  { accessorKey: 'weight', header: 'Weight', enableSorting: true, meta: { numeric: true } },
]

const data: Row[] = [
  { id: '1', item: 'Gold chain', purity: '14 Karat', weight: 12.4 },
  { id: '2', item: 'Silver ring', purity: '925', weight: 3.1 },
]

function itemCells(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
    (cell) => cell.textContent
  )
}

const many: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i + 1),
  item: `Lot ${i + 1}`,
  purity: '14 Karat',
  weight: i + 1,
}))

describe('DataTable, 2026-10-19 Library', () => {
  it('axe finds nothing in the mobile list or with expand, resize and pinning on', async () => {
    const mobile = render(<DataTable columns={columns} data={data} label="Scrap" layout="mobile" />)
    await expectNoAxeViolations(mobile.container)
    mobile.unmount()
    const rich = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        resizable
        pinned={['item']}
        renderExpanded={(row) => <p>{row.item}</p>}
      />
    )
    await expectNoAxeViolations(rich.container)
  })

  it('the toolbar sits in its own row and a full-width divider follows it; no toolbar, no divider (1172:254)', () => {
    const withToolbar = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        title="Scrap"
        toolbar={<div data-testid="toolbar">filters</div>}
      />
    )
    const slot = withToolbar.container.querySelector('[data-part="toolbar"]') as HTMLElement
    expect(slot.contains(withToolbar.getByTestId('toolbar'))).toBe(true)
    expect(slot.className).toContain('px-md')
    const divider = withToolbar.container.querySelector('[data-part="toolbar-divider"]')!
    expect(slot.nextElementSibling).toBe(divider)
    withToolbar.unmount()
    const without = render(<DataTable columns={columns} data={data} label="Scrap" title="Scrap" />)
    expect(without.container.querySelector('[data-part="toolbar-divider"]')).toBeNull()
  })

  it('every body row and the column heads carry the inset rule (56:33)', () => {
    const { container } = render(<DataTable columns={columns} data={data} label="Scrap" />)
    const rows = container.querySelectorAll('tr[data-rule="inset"]')
    expect(rows.length).toBe(3)
  })

  it('Layout=Mobile draws no column heads and one row per record, label and value lines under a title (1120:4288)', () => {
    const { container, getAllByRole, queryAllByRole } = render(
      <DataTable
        columns={[
          { accessorKey: 'item', header: 'Item' },
          { accessorKey: 'purity', header: 'Purity' },
        ]}
        data={data}
        label="Scrap"
        layout="mobile"
      />
    )
    expect(queryAllByRole('columnheader')).toHaveLength(0)
    const items = getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Gold chain').className).toContain('font-medium')
    expect(within(items[0]!).getByText('Purity').className).toContain('text-muted-foreground')
    expect(within(items[0]!).getByText('14 Karat')).toBeTruthy()
    expect(container.querySelectorAll('[data-part="row-divider"]')).toHaveLength(1)
  })

  it('the mobile row is a children slot the feature fills, handed the record and its rendered cells (1210:6550)', () => {
    const { getAllByTestId } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        layout="mobile"
        mobileRow={(row, cells) => (
          <div data-testid="card">
            {row.item}:{cells.length}
          </div>
        )}
      />
    )
    expect(getAllByTestId('card').map((node) => node.textContent)).toEqual([
      'Gold chain:3',
      'Silver ring:3',
    ])
  })

  it('a hidden column stays in the model and is not drawn', () => {
    const { queryByRole } = render(
      <DataTable
        columns={[
          { accessorKey: 'item', header: 'Item' },
          { accessorKey: 'purity', header: 'Purity', meta: { hidden: true } },
        ]}
        data={data}
        label="Scrap"
      />
    )
    expect(queryByRole('columnheader', { name: 'Purity' })).toBeNull()
  })

  it('server pagination draws the pager from pageCount and reports the page, never slicing the data', () => {
    const onPageChange = vi.fn()
    const { container, getByRole } = render(
      <DataTable
        columns={columns}
        data={many.slice(0, 10)}
        label="Lots"
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
      />
    )
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
    fireEvent.click(getByRole('button', { name: 'Page 2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it("expanded rows: an Expand control per row opens the feature's detail row under it (1176:5616, 1176:6649)", () => {
    const { getAllByRole, queryByText, getByText } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        renderExpanded={(row) => <p>Detail of {row.item}</p>}
      />
    )
    const toggles = getAllByRole('button', { name: 'Expand row' })
    expect(toggles).toHaveLength(2)
    expect(toggles[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('Detail of Gold chain')).toBeNull()
    fireEvent.click(toggles[0]!)
    expect(getByText('Detail of Gold chain')).toBeTruthy()
    expect(getAllByRole('button', { name: 'Collapse row' })[0]!.getAttribute('aria-expanded')).toBe(
      'true'
    )
  })

  it('grouping draws a Group row with the value and its count, collapsible (1176:6625)', () => {
    const grouped: Row[] = [
      { id: '1', item: 'Chain', purity: '14 Karat', weight: 1 },
      { id: '2', item: 'Ring', purity: '14 Karat', weight: 2 },
      { id: '3', item: 'Coin', purity: '925', weight: 3 },
    ]
    const { container, getByRole, queryByText, getByText } = render(
      <DataTable
        columns={columns}
        data={grouped}
        label="Scrap"
        grouping={['purity']}
        groupCount={(count) => `${count} lots`}
      />
    )
    const groups = container.querySelectorAll('tr[data-part="group-row"]')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.textContent).toContain('14 Karat')
    expect(getByText('2 lots').className).toContain('text-muted-foreground')
    expect(groups[0]!.className).toContain('bg-surface-soft')
    expect(getByText('Chain')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Collapse 14 Karat' }))
    expect(queryByText('Chain')).toBeNull()
    expect(getByText('Coin')).toBeTruthy()
  })

  it('resizable columns draw a resize handle per head that drags the width (1176:1184)', () => {
    const { container, getAllByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" resizable />
    )
    const handles = getAllByRole('separator')
    expect(handles).toHaveLength(3)
    expect(handles[0]!.getAttribute('aria-label')).toBe('Resize Item')
    const head = container.querySelector('th') as HTMLElement
    const before = parseFloat(head.style.width)
    fireEvent.mouseDown(handles[0]!, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document, { clientX: 160 })
    expect(parseFloat((container.querySelector('th') as HTMLElement).style.width)).toBe(before + 60)
  })

  it('a pinned column sticks at the start with the pin shadow on its edge (1176:5623)', () => {
    const { container } = render(
      <DataTable columns={columns} data={data} label="Scrap" pinned={['item']} />
    )
    const head = container.querySelector('th') as HTMLElement
    const cell = container.querySelector('tbody td') as HTMLElement
    for (const node of [head, cell]) {
      expect(node.className).toContain('sticky')
      expect(node.style.insetInlineStart).toBe('0px')
      expect(node.querySelector('[data-part="pin-shadow"]')).toBeTruthy()
    }
    expect(container.querySelectorAll('tbody td')[1]!.className).not.toContain('sticky')
  })
})

describe('DataTable, review fixes', () => {
  it('client paging: on the last page, when the data shrinks, the page follows and the rows stay', () => {
    const eleven = many.slice(0, 11)
    const { container, getByRole, getByText, rerender } = render(
      <DataTable columns={columns} data={eleven} label="Lots" pageSize={10} />
    )
    fireEvent.click(getByRole('button', { name: 'Page 2' }))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
    rerender(<DataTable columns={columns} data={eleven.slice(0, 10)} label="Lots" pageSize={10} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(getByText('1\u201310')).toBeTruthy()
    expect(getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')
  })

  const grouped: Row[] = [
    { id: '1', item: 'Chain', purity: '14 Karat', weight: 1 },
    { id: '2', item: 'Coin', purity: '925', weight: 3 },
  ]

  it('grouping turned on later opens its groups', () => {
    const { getByText, queryByText, rerender } = render(
      <DataTable columns={columns} data={grouped} label="Scrap" />
    )
    expect(queryByText('Chain')).toBeTruthy()
    rerender(<DataTable columns={columns} data={grouped} label="Scrap" grouping={['purity']} />)
    expect(getByText('Chain')).toBeTruthy()
    expect(getByText('Coin')).toBeTruthy()
  })

  it('with grouping and detail rows, groups open and detail rows stay closed', () => {
    const { getByText, queryByText } = render(
      <DataTable
        columns={columns}
        data={grouped}
        label="Scrap"
        grouping={['purity']}
        renderExpanded={(row) => <p>Detail of {row.item}</p>}
      />
    )
    expect(getByText('Chain')).toBeTruthy()
    expect(queryByText('Detail of Chain')).toBeNull()
  })

  it('a hidden column takes no width and no pinned offset', () => {
    const { container } = render(
      <DataTable
        columns={[
          { accessorKey: 'purity', header: 'Purity', meta: { hidden: true } },
          { accessorKey: 'item', header: 'Item' },
          { accessorKey: 'weight', header: 'Weight' },
        ]}
        data={data}
        label="Scrap"
        pinned={['item']}
        resizable
      />
    )
    const head = container.querySelector('th') as HTMLElement
    expect(head.textContent).toContain('Item')
    expect(head.style.insetInlineStart).toBe('0px')
    expect((container.querySelector('table') as HTMLElement).style.width).toBe('300px')
  })

  it('a pinned cell takes the row hover and selected fill', () => {
    const { container } = render(
      <DataTable columns={columns} data={data} label="Scrap" pinned={['item']} selectable />
    )
    const cell = container.querySelector('tbody td.sticky') as HTMLElement
    expect(cell.className).toContain('[tbody>tr:hover>&]:bg-highest')
    expect(cell.className).toContain('[tr[data-state=selected]>&]:bg-surface-raised')
  })

  it('evenColumns gives every drawn column the same share', () => {
    const { container } = render(
      <DataTable columns={columns} data={data} label="Scrap" evenColumns />
    )
    const widths = Array.from(container.querySelectorAll('th')).map(
      (head) => (head as HTMLElement).style.width
    )
    expect(new Set(widths).size).toBe(1)
    expect(parseFloat(widths[0]!)).toBeCloseTo(100 / 3)
  })

  it('the empty state wraps inside its cell', () => {
    const { getByText } = render(
      <DataTable columns={columns} data={[]} label="Scrap" empty={<p>Nothing yet</p>} />
    )
    const cell = getByText('Nothing yet').closest('td') as HTMLElement
    expect(cell.className).toContain('whitespace-normal')
    expect(cell.className).not.toContain('whitespace-nowrap')
  })
})
