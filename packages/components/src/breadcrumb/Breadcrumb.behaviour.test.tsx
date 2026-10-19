import { describe, expect, it } from 'vitest'
import * as React from 'react'

import { Breadcrumb, type BreadcrumbCrumb } from './Breadcrumb'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const items: BreadcrumbCrumb[] = [
  { label: 'Home', href: '/' },
  { label: 'Admin' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Archive' },
  { label: 'PO-12' },
]

describe('Breadcrumb', () => {
  it.each([
    ['full', 'full' as const],
    ['collapsed', 'collapsed' as const],
  ])('%s renders and axe finds nothing', async (_name, depth) => {
    const { container, getByRole } = setup(<Breadcrumb items={items} depth={depth} />)
    expect(getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('no items renders nothing; one item is the current page alone', () => {
    const { container, rerender, getByText } = setup(<Breadcrumb items={[]} />)
    expect(container.innerHTML).toBe('')
    rerender(<Breadcrumb items={[{ label: 'Home' }]} />)
    expect(getByText('Home').getAttribute('aria-current')).toBe('page')
  })

  it('a crumb without href is plain text, with href a link', () => {
    const { getByRole, getByText } = setup(<Breadcrumb items={items.slice(0, 3)} />)
    expect(getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
    expect(getByText('Admin').tagName.toLowerCase()).toBe('span')
  })

  it('collapsed opens the hidden crumbs from the keyboard; linked ones are links, plain ones disabled', async () => {
    const { user, getByRole, findByRole } = setup(<Breadcrumb items={items} depth="collapsed" />)
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(getByRole('button', { name: 'Show hidden crumbs' }))
    await user.keyboard('{Enter}')
    const menu = await findByRole('menu')
    expect(menu.textContent).toContain('Admin')
    expect(getByRole('menuitem', { name: 'Orders' }).getAttribute('href')).toBe('/admin/orders')
    expect(getByRole('menuitem', { name: 'Archive' }).getAttribute('aria-disabled')).toBe('true')
    await user.keyboard('{Escape}')
  })

  it('a custom link component renders each linked crumb, in and out of the menu', async () => {
    function AppLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
      return <a {...props} data-app-link="" />
    }
    const { user, container, getByRole, findByRole } = setup(
      <Breadcrumb items={items} depth="collapsed" linkComponent={AppLink} />
    )
    expect(container.querySelector('[data-app-link]')!.textContent).toBe('Home')
    await user.click(getByRole('button', { name: 'Show hidden crumbs' }))
    await findByRole('menu')
    expect(getByRole('menuitem', { name: 'Orders' }).hasAttribute('data-app-link')).toBe(true)
  })

  it('three or fewer crumbs never collapse', () => {
    const { queryByRole } = setup(<Breadcrumb items={items.slice(0, 3)} depth="collapsed" />)
    expect(queryByRole('button', { name: 'Show hidden crumbs' })).toBeNull()
  })
})
