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
      description="23 lots on hand"
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
