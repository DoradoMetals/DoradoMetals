import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

import { DataTable, type DataTableColumn } from './DataTable'
import { makeRows, type TestRow } from '../test/rows'
import { expectNoAxeViolations } from '../test/axe'

const columns: DataTableColumn<TestRow>[] = [
  { accessorKey: 'item', header: 'Item' },
  { accessorKey: 'metal', header: 'Metal' },
  { accessorKey: 'weight', header: 'Weight', enableSorting: true, meta: { numeric: true } },
]

const VIEWPORT_PX = 480
const ROW_PX = 48

function bodyItems(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr:not([aria-hidden]) td:first-child')).map(
    (cell) => cell.textContent ?? ''
  )
}

describe('DataTable, virtualized scroll over 1,000 rows', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.dataset.part === 'viewport' ? VIEWPORT_PX : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  })

  it('draws only a window of the rows, padded to the full height', () => {
    const { container } = render(
      <DataTable columns={columns} data={makeRows(1000)} label="Lots" scrolling="virtualized" />
    )
    const drawn = bodyItems(container)
    expect(drawn[0]).toBe('Item 0001')
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.length).toBeLessThan(40)
    const pad = container.querySelector('tbody tr[aria-hidden]:last-child') as HTMLElement
    expect(parseFloat(pad.style.height)).toBe(1000 * ROW_PX - drawn.length * ROW_PX)
  })

  it('scrolling the viewport moves the window and pads the top', () => {
    const { container } = render(
      <DataTable columns={columns} data={makeRows(1000)} label="Lots" scrolling="virtualized" />
    )
    const viewport = container.querySelector('[data-part="viewport"]') as HTMLElement
    viewport.scrollTop = 500 * ROW_PX
    fireEvent.scroll(viewport)
    const drawn = bodyItems(container)
    expect(drawn).toContain('Item 0501')
    expect(drawn).not.toContain('Item 0001')
    const top = container.querySelector('tbody tr[aria-hidden]:first-child') as HTMLElement
    expect(parseFloat(top.style.height)).toBeGreaterThan(400 * ROW_PX)
  })

  it('the head stays sticky inside the viewport and axe finds nothing', async () => {
    const { container } = render(
      <DataTable columns={columns} data={makeRows(1000)} label="Lots" scrolling="virtualized" />
    )
    expect(container.querySelector('thead')!.className).toContain('sticky')
    await expectNoAxeViolations(container)
  })
})
