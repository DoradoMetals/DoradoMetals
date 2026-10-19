import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { DataTable, type DataTableColumn } from './DataTable'
import { TableActions } from './TableActions'
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

describe('DataTable', () => {
  it('renders a real table through the package shell, and axe finds nothing', async () => {
    const { container } = render(<DataTable columns={columns} data={data} label="Scrap" />)
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('tbody tr').length).toBe(2)
    await expectNoAxeViolations(container)
  })

  it('zero rows renders the empty slot', () => {
    const { getByText } = render(
      <DataTable columns={columns} data={[]} label="Scrap" empty="Nothing yet" />
    )
    expect(getByText('Nothing yet')).toBeTruthy()
  })

  it('sorting cycles ascending, descending, then back to none', () => {
    const { container, getByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" />
    )
    const sortButton = getByRole('button', { name: /weight/i })

    fireEvent.click(sortButton)
    expect(container.querySelector('th[aria-sort="ascending"]')).toBeTruthy()
    expect(itemCells(container)).toEqual(['Silver ring', 'Gold chain'])

    fireEvent.click(sortButton)
    expect(container.querySelector('th[aria-sort="descending"]')).toBeTruthy()
    expect(itemCells(container)).toEqual(['Gold chain', 'Silver ring'])

    fireEvent.click(sortButton)
    expect(container.querySelector('th[aria-sort="none"]')).toBeTruthy()
    expect(itemCells(container)).toEqual(['Gold chain', 'Silver ring'])
  })

  it('a column with sorting disabled renders no sort control', () => {
    const { getByText } = render(<DataTable columns={columns} data={data} label="Scrap" />)
    const purityHeader = getByText('Purity').closest('th')!
    expect(purityHeader.hasAttribute('aria-sort')).toBe(false)
    expect(purityHeader.querySelector('button')).toBeNull()
  })

  it('selection supports an indeterminate header checkbox', () => {
    const { getByRole, getAllByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" selectable />
    )
    const headerCheckbox = getByRole('checkbox', { name: 'Select all rows' })
    const rowCheckboxes = getAllByRole('checkbox', { name: 'Select row' })
    expect(rowCheckboxes.length).toBe(2)
    expect(headerCheckbox.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(rowCheckboxes[0]!)
    expect(headerCheckbox.getAttribute('aria-checked')).toBe('mixed')

    fireEvent.click(rowCheckboxes[1]!)
    expect(headerCheckbox.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(headerCheckbox)
    expect(rowCheckboxes[0]!.getAttribute('aria-checked')).toBe('false')
    expect(rowCheckboxes[1]!.getAttribute('aria-checked')).toBe('false')
  })

  it('renders the actions slot without knowing what is inside it', () => {
    const { getByRole } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        title="Scrap"
        actions={<button>New</button>}
      />
    )
    expect(getByRole('button', { name: 'New' })).toBeTruthy()
  })

  it('a clickable row fires on click and on Enter, and is reachable by keyboard', async () => {
    const seen: string[] = []
    const { getAllByRole } = render(
      <DataTable
        label="Scrap"
        columns={columns}
        data={data}
        onRowClick={(row) => seen.push(row.item)}
      />
    )
    const bodyRows = getAllByRole('row').filter((r) => r.querySelector('td'))
    expect(bodyRows[0].getAttribute('tabindex')).toBe('0')
    fireEvent.click(bodyRows[0])
    fireEvent.keyDown(bodyRows[1], { key: 'Enter', target: bodyRows[1] })
    expect(seen.length).toBe(2)
  })

  it('rows are not focusable when nothing handles a click', () => {
    const { getAllByRole } = render(<DataTable label="Scrap" columns={columns} data={data} />)
    const bodyRows = getAllByRole('row').filter((r) => r.querySelector('td'))
    expect(bodyRows[0].getAttribute('tabindex')).toBeNull()
  })
})

const many: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i + 1),
  item: `Lot ${i + 1}`,
  purity: '14 Karat',
  weight: i + 1,
}))

describe('Table 1101:444 (ruling 157, refined 2026-10-19)', () => {
  it('title row: title, actions slot on the right, divider under it (1172:254)', () => {
    const { getByRole, container } = render(
      <DataTable columns={columns} data={data} label="Scrap" title="Customers" />
    )
    const title = getByRole('heading', { name: 'Customers' })
    const row = title.parentElement as HTMLElement
    expect(row.className).toContain('px-md')
    expect(row.className).toContain('py-sm')
    expect(container.querySelector('[data-part="title-divider"]')).toBeTruthy()
  })

  it('default actions are Table Actions: only Delete, disabled until a row is selected (1186:1440)', () => {
    const deleted: Row[][] = []
    const { getByRole, queryByRole, getAllByRole } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        title="Scrap"
        selectable
        onDelete={(rows) => deleted.push(rows)}
      />
    )
    expect(queryByRole('button', { name: 'Import' })).toBeNull()
    expect(queryByRole('button', { name: 'Export' })).toBeNull()
    const del = getByRole('button', { name: 'Delete' }) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    fireEvent.click(getAllByRole('checkbox', { name: 'Select row' })[0]!)
    expect(del.disabled).toBe(false)
    fireEvent.click(del)
    expect(deleted[0]!.map((r) => r.item)).toEqual(['Gold chain'])
  })

  it('the title row shows the selected count after the title', () => {
    const { getAllByRole, getByText } = render(
      <DataTable columns={columns} data={data} label="Scrap" title="Scrap" selectable />
    )
    fireEvent.click(getAllByRole('checkbox', { name: 'Select row' })[1]!)
    expect(getByText('1 selected').className).toContain('text-muted-foreground')
  })

  it('a feature passes its own actions; a function receives the selected rows', () => {
    const { getByRole } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        title="Scrap"
        selectable
        actions={({ selected }) => <button>Assign {selected.length}</button>}
      />
    )
    expect(getByRole('button', { name: 'Assign 0' })).toBeTruthy()
  })

  it('one optional toolbar slot sits under the divider', () => {
    const { getByTestId, container } = render(
      <DataTable
        columns={columns}
        data={data}
        label="Scrap"
        title="Scrap"
        toolbar={<div data-testid="toolbar">filters</div>}
      />
    )
    const divider = container.querySelector('[data-part="title-divider"]')!
    expect(
      divider.compareDocumentPosition(getByTestId('toolbar')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('footer reads "Showing 1–10 of 25", numbers bright and words muted, with pagination (1172:298)', () => {
    const { getByText, getByRole } = render(
      <DataTable columns={columns} data={many} label="Lots" pageSize={10} />
    )
    expect(getByText('Showing').className).toContain('text-muted-foreground')
    expect(getByText('1–10').className).toContain('text-foreground')
    expect(getByText('of').className).toContain('text-muted-foreground')
    expect(getByText('25').className).toContain('text-foreground')
    fireEvent.click(getByRole('button', { name: 'Page 3' }))
    expect(getByText('21–25')).toBeTruthy()
  })

  it('page size is a select in the footer when sizes are given (1187:145)', () => {
    const { getByRole } = render(
      <DataTable columns={columns} data={many} label="Lots" pageSize={10} pageSizes={[10, 25]} />
    )
    expect(getByRole('combobox', { name: 'Rows per page' })).toBeTruthy()
  })

  it('Loading draws skeleton rows inside the table and says so', () => {
    const { getByRole, container } = render(
      <DataTable columns={columns} data={[]} label="Scrap" loading />
    )
    expect(getByRole('status', { name: 'Loading Scrap' })).toBeTruthy()
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(1)
  })

  it('Error renders inside the table body', () => {
    const { getByText, container } = render(
      <DataTable columns={columns} data={[]} label="Scrap" error="Couldn't load" />
    )
    expect(container.querySelector('tbody')!.textContent).toContain("Couldn't load")
    expect(getByText("Couldn't load")).toBeTruthy()
  })

  it('Bordered is the default: border, radius and the card fill; Bordered=False draws none (1101:444)', () => {
    const bordered = render(<DataTable columns={columns} data={data} label="A" />)
    const root = bordered.container.firstElementChild as HTMLElement
    for (const token of ['border', 'border-border', 'rounded-lg', 'bg-card']) {
      expect(root.className.split(' ')).toContain(token)
    }
    bordered.unmount()
    const bare = render(<DataTable columns={columns} data={data} label="A" bordered={false} />)
    const plain = (bare.container.firstElementChild as HTMLElement).className.split(' ')
    for (const token of ['border', 'rounded-lg', 'bg-card']) expect(plain).not.toContain(token)
  })

  it('Scrolling=Virtualized scrolls in a fixed viewport and has no footer (1176:6886)', () => {
    const { container, queryByRole } = render(
      <DataTable columns={columns} data={many} label="Lots" scrolling="virtualized" pageSize={10} />
    )
    const viewport = container.querySelector('[data-part="viewport"]') as HTMLElement
    expect(viewport.className).toContain('overflow-y-auto')
    expect(queryByRole('navigation', { name: 'Pagination' })).toBeNull()
  })
})

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

describe('TableActions', () => {
  it('Import and Export are enabled whatever the selection; each sits behind its switch', () => {
    const { getByRole } = render(
      <TableActions showImport showExport selected={false} onDelete={() => {}} />
    )
    expect((getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false)
    expect((getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false)
    expect((getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Delete is Secondary Danger', () => {
    const { getByRole } = render(<TableActions selected onDelete={() => {}} />)
    expect(getByRole('button', { name: 'Delete' }).className).toContain('border-destructive')
  })

  describe('TableActions Delete', () => {
    it('renders Delete only when onDelete is given', () => {
      const without = render(<TableActions selected />)
      expect(without.queryByRole('button', { name: 'Delete' })).toBeNull()
      without.unmount()
      const withDelete = render(<TableActions selected onDelete={() => {}} />)
      expect(withDelete.getByRole('button', { name: 'Delete' })).toBeTruthy()
    })

    it('the default title-row actions show no Delete when the table has no onDelete', () => {
      const { queryByRole } = render(
        <DataTable columns={columns} data={data} label="Scrap" title="Scrap" selectable />
      )
      expect(queryByRole('button', { name: 'Delete' })).toBeNull()
    })
  })
})

describe('Table Footer layouts (Jacob 2026-10-19: never stacked)', () => {
  it('the footer is a size container whose row never wraps', () => {
    const { getByRole } = render(
      <DataTable columns={columns} data={many} label="Lots" pageSize={10} />
    )
    const nav = getByRole('navigation', { name: 'Pagination' })
    const row = nav.parentElement as HTMLElement
    expect((row.parentElement as HTMLElement).className).toContain('@container')
    expect(row.className).toContain('flex-nowrap')
    expect(row.className).not.toContain('flex-wrap ')
    expect(row.className).not.toContain('flex-col')
  })

  it('narrow: only the pagination, centred; the count is hidden', () => {
    const { getByRole, getByText } = render(
      <DataTable columns={columns} data={many} label="Lots" pageSize={10} />
    )
    const row = getByRole('navigation', { name: 'Pagination' }).parentElement as HTMLElement
    expect(row.className).toContain('justify-center')
    const count = getByText('Showing').closest('[data-part="count"]') as HTMLElement
    expect(count.className).toContain('hidden')
  })

  it('wide: the count on the left and the pagination on the right', () => {
    const { getByRole, getByText } = render(
      <DataTable columns={columns} data={many} label="Lots" pageSize={10} />
    )
    const row = getByRole('navigation', { name: 'Pagination' }).parentElement as HTMLElement
    expect(row.className).toContain('@xl:justify-between')
    const count = getByText('Showing').closest('[data-part="count"]') as HTMLElement
    expect(count.className).toContain('@xl:flex')
    expect(row.firstElementChild).toBe(count)
    expect(row.lastElementChild).toBe(getByRole('navigation', { name: 'Pagination' }))
  })
})
