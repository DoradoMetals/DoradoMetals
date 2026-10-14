import { describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { Breadcrumb } from './Breadcrumb'
import { axeViolations } from '../test/axe'

const items = [
  { label: 'Home', href: '/' },
  { label: 'Account', href: '/account' },
  { label: 'Section', href: '/account/section' },
  { label: 'Orders' },
]

describe('Breadcrumb', () => {
  it('is nav > ol > li with the current page not a link, and axe finds nothing (126:16)', async () => {
    const { getByRole, container } = render(<Breadcrumb items={items} />)
    const nav = getByRole('navigation', { name: 'Breadcrumb' })
    const list = within(nav).getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(nav).getAllByRole('link')).toHaveLength(3)
    const current = within(nav).getByText('Orders')
    expect(current.tagName).toBe('SPAN')
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(await axeViolations(container)).toEqual([])
  })

  it('crumbs wear the Link quiet state at Small/Regular; current is Small/Medium foreground', () => {
    const { getByRole, getByText } = render(<Breadcrumb items={items} />)
    const home = getByRole('link', { name: 'Home' })
    expect(home.className).toContain('text-muted-foreground')
    expect(home.className).toContain('hover:text-foreground')
    expect(home.className).toContain('text-small')
    expect(home.className).toContain('font-normal')
    expect(home.className).not.toContain('font-medium')
    const current = getByText('Orders')
    expect(current.className).toContain('text-small')
    expect(current.className).toContain('font-medium')
    expect(current.className).toContain('text-foreground')
  })

  it('separators are aria-hidden placeholder chevrons; the row gaps xs at control/xs height', () => {
    const { container, getByRole } = render(<Breadcrumb items={items} />)
    const chevrons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(chevrons).toHaveLength(3)
    expect(chevrons[0].getAttribute('class')).toContain('text-placeholder')
    const list = getByRole('list')
    expect(list.className).toContain('gap-xs')
    expect(list.className).toContain('min-h-(--control-xs)')
  })

  it('Depth=Collapsed folds the middle crumbs into an ellipsis menu once depth exceeds 3', () => {
    const { getByRole, queryByRole } = render(<Breadcrumb items={items} depth="collapsed" />)
    expect(queryByRole('link', { name: 'Account' })).toBeNull()
    expect(getByRole('link', { name: 'Home' })).toBeTruthy()
    const trigger = getByRole('button', { name: 'Show hidden crumbs' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    expect(menu).toBeTruthy()
    expect(within(menu).getByText('Account')).toBeTruthy()
    expect(within(menu).getByText('Section')).toBeTruthy()
  })

  it('Depth=Collapsed with three crumbs or fewer shows them all', () => {
    const { queryByRole, getAllByRole } = render(
      <Breadcrumb items={items.slice(1)} depth="collapsed" />
    )
    expect(queryByRole('button', { name: 'Show hidden crumbs' })).toBeNull()
    expect(getAllByRole('link')).toHaveLength(2)
  })

  it('linkComponent lends a routing anchor to every crumb', () => {
    const RouterLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
      function RouterLink(props, ref) {
        return <a ref={ref} data-router="" {...props} />
      }
    )
    const { getByRole } = render(<Breadcrumb items={items} linkComponent={RouterLink} />)
    expect(getByRole('link', { name: 'Home' }).hasAttribute('data-router')).toBe(true)
  })
})
