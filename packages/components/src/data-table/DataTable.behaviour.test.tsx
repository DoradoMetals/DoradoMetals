import { describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/react'

import { DataTable, type DataTableColumn, type DataTableProps } from './DataTable'
import { classList, setup } from '../test/render'
import { makeRows, type TestRow } from '../test/rows'
import { expectNoAxeViolations } from '../test/axe'

const columns: DataTableColumn<TestRow>[] = [
  { accessorKey: 'item', header: 'Item', meta: { primary: true } },
  { accessorKey: 'metal', header: 'Metal' },
  { accessorKey: 'weight', header: 'Weight', enableSorting: true, meta: { numeric: true } },
]

function items(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
    (cell) => cell.textContent ?? ''
  )
}

function bodyRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('tbody tr')).filter(
    (row) => row.dataset.part !== 'group-row'
  )
}

type Props = Partial<DataTableProps<TestRow>>

const states: [string, Props][] = [
  ['default', {}],
  ['borderless', { bordered: false }],
  ['mobile', { layout: 'mobile' }],
  ['loading', { loading: true }],
  ['loading mobile', { loading: true, layout: 'mobile' }],
  ['error', { error: 'Could not load' }],
  ['error mobile', { error: 'Could not load', layout: 'mobile' }],
  ['empty', { data: [] }],
  ['empty mobile', { data: [], layout: 'mobile' }],
  ['selectable with title', { selectable: true, title: 'Lots' }],
  ['paged with sizes', { pageSize: 2, pageSizes: [2, 5] }],
  ['server paged', { page: 1, pageCount: 3, onPageChange: () => {} }],
  ['virtualized', { scrolling: 'virtualized' }],
  ['expandable', { renderExpanded: (row) => row.item }],
  ['grouped', { grouping: ['metal'] }],
  ['resizable', { resizable: true }],
  ['pinned', { pinned: ['item'] }],
  ['even columns', { evenColumns: true }],
  ['toolbar', { toolbar: <input aria-label="Search" /> }],
]

describe('DataTable state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(
      <DataTable columns={columns} data={makeRows(5)} label="Lots" {...props} />
    )
    expect(container.firstElementChild).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default frame keeps its class list', () => {
    const { container } = setup(<DataTable columns={columns} data={makeRows(1)} label="Lots" />)
    expect(classList(container.firstElementChild)).toMatchInlineSnapshot(`
      [
        "[--table-fill:var(--color-card)]",
        "bg-card",
        "border",
        "border-border",
        "flex",
        "flex-col",
        "overflow-hidden",
        "rounded-lg",
        "w-full",
      ]
    `)
  })
})

describe('DataTable behaviour', () => {
  it('sorts from the keyboard: Enter ascends, Space descends, Enter clears', async () => {
    const data = makeRows(3)
    const { user, container, getByRole } = setup(
      <DataTable columns={columns} data={data} label="Lots" />
    )
    await user.tab()
    expect(getByRole('button', { name: /weight/i })).toBe(document.activeElement)
    const byWeight = [...data].sort((a, b) => a.weight - b.weight).map((row) => row.item)
    await user.keyboard('{Enter}')
    expect(items(container)).toEqual(byWeight)
    await user.keyboard(' ')
    expect(items(container)).toEqual([...byWeight].reverse())
    await user.keyboard('{Enter}')
    expect(items(container)).toEqual(data.map((row) => row.item))
  })

  it('select all and single rows report the selected records and turn Delete on', async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    const data = makeRows(3)
    const { user, getByRole, getAllByRole, getByText } = setup(
      <DataTable
        columns={columns}
        data={data}
        label="Lots"
        title="Lots"
        selectable
        onRowSelectionChange={onSelect}
        onDelete={onDelete}
      />
    )
    expect(onSelect).toHaveBeenLastCalledWith([])
    const remove = getByRole('button', { name: 'Delete' })
    expect(remove).toHaveProperty('disabled', true)
    await user.click(getAllByRole('checkbox', { name: 'Select row' })[1]!)
    expect(onSelect).toHaveBeenLastCalledWith([data[1]])
    expect(getByText('1 selected')).toBeTruthy()
    expect(getByRole('checkbox', { name: 'Select all rows' }).getAttribute('data-state')).toBe(
      'indeterminate'
    )
    await user.click(getByRole('checkbox', { name: 'Select all rows' }))
    expect(onSelect).toHaveBeenLastCalledWith(data)
    await user.click(remove)
    expect(onDelete).toHaveBeenCalledWith(data)
    await user.click(getByRole('checkbox', { name: 'Select all rows' }))
    expect(onSelect).toHaveBeenLastCalledWith([])
  })

  it('a row checkbox toggles with Space and marks the row selected', async () => {
    const { user, container, getAllByRole } = setup(
      <DataTable columns={columns} data={makeRows(2)} label="Lots" selectable />
    )
    getAllByRole('checkbox', { name: 'Select row' })[0]!.focus()
    await user.keyboard(' ')
    expect(bodyRows(container)[0]!.getAttribute('data-state')).toBe('selected')
  })

  it('client paging moves by Next, Previous and a page number', async () => {
    const { user, container, getByRole } = setup(
      <DataTable columns={columns} data={makeRows(5)} label="Lots" pageSize={2} />
    )
    expect(items(container)).toEqual(['Item 0001', 'Item 0002'])
    await user.click(getByRole('button', { name: 'Next page' }))
    expect(items(container)).toEqual(['Item 0003', 'Item 0004'])
    await user.click(getByRole('button', { name: 'Page 3' }))
    expect(items(container)).toEqual(['Item 0005'])
    expect(getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
    await user.click(getByRole('button', { name: 'Previous page' }))
    expect(items(container)).toEqual(['Item 0003', 'Item 0004'])
  })

  it('choosing a page size re-pages the rows', async () => {
    const { user, container, getByRole, findByRole } = setup(
      <DataTable
        columns={columns}
        data={makeRows(5)}
        label="Lots"
        pageSize={2}
        pageSizes={[2, 5]}
      />
    )
    await user.click(getByRole('combobox', { name: 'Rows per page' }))
    await user.click(await findByRole('option', { name: '5 per page' }))
    expect(items(container)).toHaveLength(5)
  })

  it('server paging: the page prop wins and the callback reports the request', async () => {
    const onPageChange = vi.fn()
    const page = makeRows(2)
    const { user, container, getByRole, rerender } = setup(
      <DataTable
        columns={columns}
        data={page}
        label="Lots"
        page={2}
        pageCount={4}
        onPageChange={onPageChange}
      />
    )
    expect(getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')
    await user.click(getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    expect(getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')
    expect(items(container)).toEqual(['Item 0001', 'Item 0002'])
    rerender(
      <DataTable
        columns={columns}
        data={page}
        label="Lots"
        page={3}
        pageCount={4}
        onPageChange={onPageChange}
      />
    )
    expect(getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page')
  })

  it('server paging with no pages draws no footer', () => {
    const { queryByRole } = setup(
      <DataTable
        columns={columns}
        data={makeRows(1)}
        label="Lots"
        page={1}
        pageCount={0}
        onPageChange={() => {}}
      />
    )
    expect(queryByRole('navigation', { name: 'Pagination' })).toBeNull()
  })

  it('a clickable row fires on Space; a key inside a cell control does not', async () => {
    const onRowClick = vi.fn()
    const data = makeRows(2)
    const { user, container, getAllByRole } = setup(
      <DataTable columns={columns} data={data} label="Lots" selectable onRowClick={onRowClick} />
    )
    bodyRows(container)[1]!.focus()
    await user.keyboard(' ')
    expect(onRowClick).toHaveBeenCalledWith(data[1])
    onRowClick.mockClear()
    getAllByRole('checkbox', { name: 'Select row' })[0]!.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('a')
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('the expand control opens the detail row from the keyboard without clicking the row', async () => {
    const onRowClick = vi.fn()
    const { user, getAllByRole, queryByText, getByText } = setup(
      <DataTable
        columns={columns}
        data={makeRows(2)}
        label="Lots"
        onRowClick={onRowClick}
        renderExpanded={(row) => <p>Detail for {row.item}</p>}
      />
    )
    const toggle = getAllByRole('button', { name: 'Expand row' })[0]!
    await user.click(toggle)
    expect(getByText('Detail for Item 0001')).toBeTruthy()
    expect(onRowClick).not.toHaveBeenCalled()
    const collapse = getAllByRole('button', { name: 'Collapse row' })[0]!
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    collapse.focus()
    await user.keyboard('{Enter}')
    expect(queryByText('Detail for Item 0001')).toBeNull()
  })

  it('a group collapses and opens again, with a custom count', async () => {
    const { user, container, getByRole } = setup(
      <DataTable
        columns={columns}
        data={makeRows(6)}
        label="Lots"
        grouping={['metal']}
        groupCount={(count) => `${count} lots`}
      />
    )
    const gold = getByRole('button', { name: 'Collapse Gold' })
    expect(within(gold.closest('tr')!).getByText('2 lots')).toBeTruthy()
    expect(bodyRows(container)).toHaveLength(6)
    await user.click(gold)
    expect(bodyRows(container)).toHaveLength(4)
    await user.click(getByRole('button', { name: 'Expand Gold' }))
    expect(bodyRows(container)).toHaveLength(6)
  })

  it('a mobile row is clickable from the keyboard and shows its selected state', async () => {
    const onRowClick = vi.fn()
    const data = makeRows(2)
    const { user, getAllByRole } = setup(
      <DataTable
        columns={columns}
        data={data}
        label="Lots"
        layout="mobile"
        onRowClick={onRowClick}
      />
    )
    const rows = getAllByRole('listitem')
    rows[0]!.focus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(data[0])
    await user.click(rows[1]!)
    expect(onRowClick).toHaveBeenLastCalledWith(data[1])
  })
})

describe('DataTable edges', () => {
  it('one row draws one row and a one-page footer', () => {
    const { container, getByRole } = setup(
      <DataTable columns={columns} data={makeRows(1)} label="Lots" pageSize={10} />
    )
    expect(bodyRows(container)).toHaveLength(1)
    expect(getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
    expect(container.querySelector('[data-part="count"]')!.textContent).toBe('Showing1–1of1')
  })

  it('empty data with paging draws the default empty text and no footer', () => {
    const { getByText, queryByRole } = setup(
      <DataTable columns={columns} data={[]} label="Lots" pageSize={10} />
    )
    expect(getByText('No results.')).toBeTruthy()
    expect(queryByRole('navigation')).toBeNull()
  })

  it('null and undefined cells, zero and negative numbers render as given', () => {
    type Loose = { id: string; item: string | null; weight: number | undefined }
    const loose: DataTableColumn<Loose>[] = [
      { accessorKey: 'item', header: 'Item' },
      { accessorKey: 'weight', header: 'Weight', meta: { numeric: true } },
    ]
    const data: Loose[] = [
      { id: 'a', item: null, weight: 0 },
      { id: 'b', item: 'Bar', weight: -12.5 },
      { id: 'c', item: 'Coin', weight: undefined },
    ]
    const { container } = setup(<DataTable columns={loose} data={data} label="Lots" />)
    const cells = Array.from(container.querySelectorAll('tbody td')).map((cell) => cell.textContent)
    expect(cells).toEqual(['', '0', 'Bar', '-12.5', 'Coin', ''])
  })

  it('long text stays in its cell and the mobile title truncates', () => {
    const long = 'Very long item name '.repeat(20).trim()
    const data = [{ ...makeRows(1)[0]!, item: long }]
    const { container, rerender } = setup(<DataTable columns={columns} data={data} label="Lots" />)
    expect(container.querySelector('tbody td')!.textContent).toBe(long)
    rerender(<DataTable columns={columns} data={data} label="Lots" layout="mobile" />)
    expect(container.querySelector('li .truncate')!.textContent).toBe(long)
  })

  it('a column with no string header gives the mobile cell no label', () => {
    const custom: DataTableColumn<TestRow>[] = [
      { accessorKey: 'item', header: 'Item' },
      { accessorKey: 'weight', header: () => <span>Weight</span> },
    ]
    const mobileRow = vi.fn(() => <span>row</span>)
    setup(
      <DataTable
        columns={custom}
        data={makeRows(1)}
        label="Lots"
        layout="mobile"
        mobileRow={mobileRow}
      />
    )
    const [, cells] = mobileRow.mock.calls[0] as unknown as [
      TestRow,
      { label: string | undefined }[],
    ]
    expect(cells.map((cell) => cell.label)).toEqual(['Item', undefined])
  })
})
