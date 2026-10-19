import { describe, expect, it } from 'vitest'

import { AdminHeader, type AdminHeaderProps } from './AdminHeader'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const slots: Omit<AdminHeaderProps, 'title' | 'layout'> = {
  nav: (
    <nav aria-label="Sections">
      <a href="#a">Orders</a>
    </nav>
  ),
  breadcrumb: (
    <nav aria-label="Breadcrumb">
      <a href="#b">Home</a>
    </nav>
  ),
  chips: <button type="button">Open</button>,
  totals: '12 orders',
  search: <input aria-label="Search" />,
  action: <button type="button">New order</button>,
  radio: (
    <div role="radiogroup" aria-label="Scope">
      <input type="radio" aria-label="All" />
    </div>
  ),
  radioLabel: 'Scope',
  selects: (
    <select aria-label="Status">
      <option>Any</option>
    </select>
  ),
  filters: <button type="button">More filters</button>,
  reset: <button type="button">Reset</button>,
  count: '12 results',
}

const layouts = ['desktop', 'mobile'] as const

describe('AdminHeader state matrix', () => {
  it.each(layouts)('%s with every slot renders each slot and axe finds nothing', async (layout) => {
    const { container, getByRole, getByText } = setup(
      <AdminHeader title="Orders" layout={layout} {...slots} />
    )
    for (const name of ['Sections', 'Breadcrumb'])
      expect(getByRole('navigation', { name })).toBeTruthy()
    for (const name of ['Open', 'New order', 'More filters', 'Reset'])
      expect(getByRole('button', { name })).toBeTruthy()
    expect(getByRole('textbox', { name: 'Search' })).toBeTruthy()
    expect(getByRole('radiogroup', { name: 'Scope' })).toBeTruthy()
    expect(getByRole('combobox', { name: 'Status' })).toBeTruthy()
    expect(getByText('12 orders')).toBeTruthy()
    expect(getByText('12 results')).toBeTruthy()
    expect(getByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it.each(layouts)('%s with only a title renders no toolbar', async (layout) => {
    const { container } = setup(<AdminHeader title="Orders" layout={layout} />)
    expect(container.querySelectorAll('section > div')).toHaveLength(1)
    await expectNoAxeViolations(container)
  })

  it.each(Object.keys(slots).filter((key) => key !== 'radioLabel'))(
    'the %s slot alone renders what it is given in both layouts',
    (key) => {
      for (const layout of layouts) {
        const { getByTestId, unmount } = setup(
          <AdminHeader
            title="Orders"
            layout={layout}
            {...{ [key]: <span data-testid={key}>{key}</span> }}
          />
        )
        expect(getByTestId(key).textContent).toBe(key)
        unmount()
      }
    }
  )

  it('the default section keeps its class list', () => {
    const { container } = setup(<AdminHeader title="Orders" />)
    expect(classList(container.querySelector('section'))).toMatchInlineSnapshot(`
      [
        "bg-card",
        "border",
        "border-border",
        "flex",
        "flex-col",
        "rounded-lg",
      ]
    `)
  })
})

describe('AdminHeader behaviour', () => {
  it('desktop Tab order runs nav, breadcrumb, chips, search, action, then the filter row', async () => {
    const { user } = setup(<AdminHeader title="Orders" {...slots} />)
    const names: string[] = []
    for (let i = 0; i < 9; i++) {
      await user.tab()
      const el = document.activeElement as HTMLElement
      names.push(el.getAttribute('aria-label') ?? el.textContent ?? '')
    }
    expect(names).toEqual([
      'Orders',
      'Open',
      'Home',
      'Search',
      'New order',
      'All',
      'Status',
      'More filters',
      'Reset',
    ])
  })

  it('mobile Tab order runs breadcrumb, chips, search, action, then radio, selects, filters, reset', async () => {
    const { user } = setup(
      <AdminHeader title="Orders" layout="mobile" {...slots} nav={undefined} />
    )
    const names: string[] = []
    for (let i = 0; i < 8; i++) {
      await user.tab()
      const el = document.activeElement as HTMLElement
      names.push(el.getAttribute('aria-label') ?? el.textContent ?? '')
    }
    expect(names).toEqual([
      'Home',
      'Open',
      'Search',
      'New order',
      'All',
      'Status',
      'More filters',
      'Reset',
    ])
  })

  it('typing into the search slot and clearing it reaches the given input', async () => {
    const { user, getByRole } = setup(
      <AdminHeader title="Orders" search={<input aria-label="Search" />} />
    )
    const box = getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    await user.type(box, 'PO-12')
    expect(box.value).toBe('PO-12')
    await user.clear(box)
    expect(box.value).toBe('')
  })
})

describe('AdminHeader edges', () => {
  it('a count of zero reads 0; a missing count keeps the line with a no-break space', () => {
    const { container, rerender } = setup(
      <AdminHeader title="Orders" reset={<button type="button">Reset</button>} count={0} />
    )
    expect(container.querySelector('p.micro')!.textContent).toBe('0')
    rerender(<AdminHeader title="Orders" reset={<button type="button">Reset</button>} />)
    expect(container.querySelector('p.micro')!.textContent).toBe(' ')
  })

  it('a long title renders whole', () => {
    const long = 'Orders awaiting review from the refiner '.repeat(5).trim()
    const { getByRole } = setup(<AdminHeader title={long} />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(long)
  })

  it('a radio label without a radio draws nothing for it', () => {
    const { queryByText } = setup(<AdminHeader title="Orders" radioLabel="Scope" count="1" />)
    expect(queryByText('Scope')).toBeNull()
  })
})
