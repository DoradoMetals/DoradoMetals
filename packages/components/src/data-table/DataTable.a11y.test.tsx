import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { DataTable, type DataTableColumn } from './DataTable'

type Row = { id: string; item: string; weight: number }

const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'item', header: 'Item' },
  { accessorKey: 'weight', header: 'Weight', enableSorting: true },
]

const many: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i + 1),
  item: `Lot ${i + 1}`,
  weight: i,
}))

describe('DataTable accessibility', () => {
  it('the selected count and the showing count are polite live regions', () => {
    const { getAllByRole, getByText } = render(
      <DataTable columns={columns} data={many} label="Lots" title="Lots" selectable pageSize={10} />
    )
    const live = document.querySelector('[data-part="selected-count"]') as HTMLElement
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('')
    fireEvent.click(getAllByRole('checkbox', { name: 'Select row' })[0]!)
    expect(getByText('1 selected')).toBe(live)
    expect(getByText('Showing').closest('[aria-live="polite"]')).toBeTruthy()
  })

  it('the expand and group toggles show the focus ring', () => {
    const { getAllByRole } = render(
      <DataTable
        columns={columns}
        data={many.slice(0, 2)}
        label="Lots"
        renderExpanded={(row) => <p>{row.item}</p>}
      />
    )
    for (const toggle of getAllByRole('button', { name: 'Expand row' })) {
      expect(toggle.className).toContain('focus-ring')
      expect(toggle.className).not.toContain('hit-area')
    }
  })

  it('a clickable row shows the focus ring', () => {
    const { getAllByRole } = render(
      <DataTable columns={columns} data={many.slice(0, 2)} label="Lots" onRowClick={() => {}} />
    )
    const rows = getAllByRole('row').filter((r) => r.getAttribute('tabindex') === '0')
    expect(rows.length).toBe(2)
    for (const row of rows) expect(row.className).toContain('focus-ring')
  })
})
