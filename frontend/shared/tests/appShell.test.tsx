// THE CHROME, BY WHO IS LOOKING AT IT.
//
// What this pins is the link table, not the layout: which routes the header
// offers a signed-out visitor, a signed-in customer and an admin, that the
// drawer behind the hamburger offers the same ones, and that the footer's one
// column follows the account. Every href asserted here is a route that exists
// under `frontend/app/` - a link in the chrome that 404s is the one failure
// this file is for.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const session: { user: { name?: string; email?: string; role?: string } | null } = { user: null }
const signOut = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/shared/hooks/auth/queries', () => ({
  useGetSession: () => ({ user: session.user, isPending: false }),
  useSignOut: () => ({ mutate: signOut, isPending: false }),
}))

const { AppShell } = await import('@/shared/ui/AppShell')

const asCustomer = () => {
  session.user = { name: 'Dana Doe', email: 'dana@example.invalid', role: 'user' }
}
const asAdmin = () => {
  session.user = { name: 'Jacob Johnson', email: 'jacob@example.invalid', role: 'admin' }
}

const shell = () => render(<AppShell>a page</AppShell>)

const header = () => document.querySelector('header') as HTMLElement
const footer = () => document.querySelector('footer') as HTMLElement

const hrefsIn = (root: HTMLElement) =>
  [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))

// The drawer is the mobile menu: the hamburger opens it, and it is portalled to
// the body rather than nested in the header.
const openDrawer = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  return screen.getByRole('navigation', { name: 'Menu' })
}

// Radix opens a dropdown from the keyboard as well as the pointer, and the
// keyboard path is the one jsdom implements faithfully.
const openAccountMenu = () => {
  fireEvent.keyDown(screen.getByLabelText('Account menu'), { key: 'Enter' })
  return document.body.querySelector('[role="menu"]') as HTMLElement
}

beforeEach(() => {
  session.user = null
  signOut.mockClear()
})

describe('the header, signed out', () => {
  test('offers Home and a Sign in link, and no admin anything', () => {
    shell()
    const bar = header()
    expect(within(bar).getByText('Home')).toBeTruthy()
    expect(within(bar).queryByText('Admin')).toBeNull()
    expect(within(bar).getByText('Sign in')).toBeTruthy()
    expect(screen.queryByLabelText('Account menu')).toBeNull()
    expect(hrefsIn(bar)).toContain('/auth/sign-in')
  })

  test('the drawer carries the same entries the bar does', () => {
    shell()
    const panel = openDrawer()
    expect(hrefsIn(panel)).toEqual(['/', '/auth/sign-in', '/auth/sign-up'])
    expect(within(panel).queryByText('Sign out')).toBeNull()
  })

  test('the footer Account column is the two ways in', () => {
    shell()
    expect(hrefsIn(footer())).toEqual(['/', '/auth/sign-in', '/auth/sign-up'])
  })
})

describe('the header, signed in', () => {
  beforeEach(asCustomer)

  test('swaps the Sign in link for the avatar menu', () => {
    shell()
    expect(within(header()).queryByText('Sign in')).toBeNull()
    expect(screen.getByLabelText('Account menu')).toBeTruthy()
    expect(within(header()).getByText('DD')).toBeTruthy()
  })

  test('the menu is Account, the two Settings screens and Sign out', () => {
    shell()
    const menu = openAccountMenu()
    expect(within(menu).getByText('Account')).toBeTruthy()
    // The account line is the session's own name, falling back to its email.
    expect(within(menu).getByText('Dana Doe')).toBeTruthy()
    expect(within(menu).getByText('Settings')).toBeTruthy()
    expect(hrefsIn(menu)).toEqual(['/settings/email', '/settings/phone'])

    fireEvent.click(within(menu).getByText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  test('a customer is offered no Admin link anywhere', () => {
    shell()
    expect(within(header()).queryByText('Admin')).toBeNull()
    expect(hrefsIn(openDrawer())).toEqual(['/', '/settings/email', '/settings/phone'])
  })

  test('the footer Account column follows the session', () => {
    shell()
    expect(hrefsIn(footer())).toEqual(['/', '/settings/email', '/settings/phone'])
  })
})

describe('the header, signed in as an admin', () => {
  beforeEach(asAdmin)

  test('the nav gains Admin, pointing at the admin index', () => {
    shell()
    const bar = header()
    expect(within(bar).getByText('Admin')).toBeTruthy()
    expect(hrefsIn(bar)).toContain('/admin')
  })

  test('the drawer carries the nav and the account entries together', () => {
    shell()
    const panel = openDrawer()
    expect(hrefsIn(panel)).toEqual(['/', '/admin', '/settings/email', '/settings/phone'])
    fireEvent.click(within(panel).getByText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
