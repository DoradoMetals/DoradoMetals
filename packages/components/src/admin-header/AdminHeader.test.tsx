import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { AdminHeader } from './AdminHeader'
import { Breadcrumb } from '../breadcrumb/Breadcrumb'
import { Button } from '../button/Button'
import { Chip } from '../chip/Chip'
import { Input } from '../input/Input'
import { Select } from '../select/Select'
import { axeViolations } from '../test/axe'

const items = [{ value: 'gold', label: 'Gold' }]

function full(layout: 'desktop' | 'mobile') {
  return render(
    <AdminHeader
      layout={layout}
      title="Inventory"
      totals="23 lots on hand"
      nav={<a href="/admin/orders">Orders</a>}
      breadcrumb={
        <Breadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'Inventory' }]} />
      }
      chips={
        <>
          <Chip label="All" selected />
          <Chip label="Gold" />
        </>
      }
      search={<Input aria-label="Search" placeholder="Search lots" />}
      action={<Button>New lot</Button>}
      selects={
        <>
          <Select label="Metal" items={items} />
          <Select label="Sort by" items={items} />
        </>
      }
      reset={
        <Button variant="tertiary" size="sm">
          Reset
        </Button>
      }
      count="48 matching"
    />
  )
}

describe('AdminHeader', () => {
  it('desktop (730:8) renders every slot on a card surface, and axe finds nothing', async () => {
    const { container, getByRole, getByText } = full('desktop')
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('bg-card')
    expect(root.className).toContain('border-border')
    expect(root.className).toContain('rounded-lg')
    const title = getByRole('heading', { name: 'Inventory' })
    expect(title.className).toContain('text-h2')
    expect(getByText('23 lots on hand').className).toContain('text-muted-foreground')
    expect(getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    expect(getByRole('button', { name: 'New lot' })).toBeTruthy()
    expect(getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('desktop puts the chips on the title line and pads the sides lg', () => {
    const { getByRole } = full('desktop')
    const titleLine = getByRole('heading', { name: 'Inventory' }).parentElement as HTMLElement
    expect(titleLine.className).toContain('gap-md')
    expect(titleLine.textContent).toContain('All')
    const head = titleLine.parentElement?.parentElement?.parentElement as HTMLElement
    expect(head.className).toContain('px-lg')
  })

  it('mobile (734:269) stacks title, chips, search and action; title is Stat/XSmall', async () => {
    const { container, getByRole } = full('mobile')
    const title = getByRole('heading', { name: 'Inventory' })
    expect(title.className).toContain('stat-xs')
    expect(title.parentElement?.textContent).not.toContain('All')
    const head = title.parentElement?.parentElement as HTMLElement
    expect(head.className).toContain('px-md')
    expect(container.querySelector('.grid.grid-cols-2')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('every part is optional: a bare title renders no nav, toolbar or actions', () => {
    const { container, queryByRole } = render(<AdminHeader title="Orders" />)
    expect(queryByRole('button')).toBeNull()
    expect(queryByRole('textbox')).toBeNull()
    expect(container.querySelector('.border-t')).toBeNull()
    expect(container.querySelector('.border-b')).toBeNull()
  })

  it('the radio slot carries its label on desktop', () => {
    const { getByText } = render(
      <AdminHeader
        title="People"
        radio={<div role="radiogroup" aria-label="Showing" />}
        radioLabel="Showing"
      />
    )
    expect(getByText('Showing').className).toContain('micro')
  })
})

describe('AdminHeader count, filter slot and mobile divider (730:8, 734:269)', () => {
  it('the count is always shown in the toolbar, muted micro, even with no Reset', () => {
    const { getByText } = render(
      <AdminHeader
        title="Orders"
        selects={<Select label="Metal" items={items} />}
        count="48 matching"
      />
    )
    const count = getByText('48 matching')
    expect(count.className).toContain('micro')
    expect(count.className).toContain('text-muted-foreground')
  })

  it('desktop stacks Reset over the count at the right of the filter row (731:174)', () => {
    const { getByText, getByRole } = full('desktop')
    const utility = getByText('48 matching').parentElement as HTMLElement
    expect(utility.className).toContain('items-end')
    expect(utility.firstElementChild?.contains(getByRole('button', { name: 'Reset' }))).toBe(true)
  })

  it('mobile puts the count left and Reset right on one line (734:899)', () => {
    const { getByText, getByRole } = full('mobile')
    const utility = getByText('48 matching').parentElement as HTMLElement
    expect(utility.className).toContain('justify-between')
    expect(utility.firstElementChild).toBe(getByText('48 matching'))
    expect(utility.contains(getByRole('button', { name: 'Reset' }))).toBe(true)
  })

  it('the filter slot passes through after the selects (1210:6558)', () => {
    const { getByText, getByTestId } = render(
      <AdminHeader
        title="Orders"
        selects={<Select label="Metal" items={items} />}
        filters={<div data-testid="slot">Extra</div>}
        count="3 matching"
      />
    )
    const slot = getByTestId('slot')
    const metal = getByText('Metal')
    expect(metal.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mobile draws a divider between the title block and the search (1223:5552)', () => {
    const { container, getByRole } = full('mobile')
    const divider = container.querySelector('[data-part="head-divider"]') as HTMLElement
    expect(divider).toBeTruthy()
    const chips = getByRole('button', { name: 'All' })
    const search = getByRole('textbox', { name: 'Search' })
    expect(chips.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divider.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mobile chips wrap (795:61)', () => {
    const { getByRole } = full('mobile')
    const row = getByRole('button', { name: 'All' }).parentElement as HTMLElement
    expect(row.className).toContain('flex-wrap')
  })

  it('desktop draws no head divider', () => {
    const { container } = full('desktop')
    expect(container.querySelector('[data-part="head-divider"]')).toBeNull()
  })

  it.each(['desktop', 'mobile'] as const)(
    'Totals is the muted line under the title, beside the always-on "N matching" count (%s, 730:8, 734:269)',
    (layout) => {
      const { getByText } = render(
        <AdminHeader
          layout={layout}
          title="Orders"
          totals="66 orders · 12 awaiting receipt"
          count="12 matching"
        />
      )
      const totals = getByText('66 orders · 12 awaiting receipt')
      expect(totals.getAttribute('data-part')).toBe('totals')
      expect(totals.className).toContain('text-muted-foreground')
      expect(getByText('12 matching')).toBeTruthy()
    }
  )
})
