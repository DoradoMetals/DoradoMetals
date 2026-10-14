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

const fakes: { data: { sms: boolean; email: boolean } | undefined } = { data: undefined }
const inbox: { data: unknown[]; refetchInterval: number | false | undefined } = {
  data: [],
  refetchInterval: undefined,
}

vi.mock('@dorado/client', async (original) => ({
  ...(await original<typeof import('@dorado/client')>()),
  useAuthFakes: () => ({ data: fakes.data, isPending: false }),
  useAccountMessages: (options: { refetchInterval?: number | false }) => {
    inbox.refetchInterval = options.refetchInterval
    return { data: inbox.data, isPending: false }
  },
  accountMessageUrl: (id: string) => `/api/account/messages/${encodeURIComponent(id)}`,
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

const openDrawer = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  return screen.getByRole('navigation', { name: 'Menu' })
}

const openAccountMenu = () => {
  fireEvent.keyDown(screen.getAllByLabelText('Account menu')[0], { key: 'Enter' })
  return document.body.querySelector('[role="menu"]') as HTMLElement
}

beforeEach(() => {
  session.user = null
  fakes.data = undefined
  inbox.data = []
  signOut.mockClear()
})

describe('the header, signed out', () => {
  test('offers the four site links and a Sign in link, and no admin anything', () => {
    shell()
    const bar = header()
    for (const label of ['How it works', 'Pricing', 'About', 'Contact']) {
      expect(within(bar).getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(within(bar).queryByText('Admin')).toBeNull()
    expect(within(bar).getByText('Sign in')).toBeTruthy()
    expect(screen.queryByLabelText('Account menu')).toBeNull()
    expect(hrefsIn(bar)).toContain('/auth/sign-in?next=%2F')
  })

  test('the drawer carries the same entries the bar does', () => {
    shell()
    const panel = openDrawer()
    expect(hrefsIn(panel)).toEqual([
      '/how-it-works',
      '/pricing',
      '/about',
      '/contact',
      '/auth/sign-in?next=%2F',
      '/auth/sign-up',
    ])
    expect(within(panel).queryByText('Sign out')).toBeNull()
  })

  test("the footer carries the Library main's columns and legal links", () => {
    shell()
    for (const heading of ['Product', 'Metals', 'Company', 'Connect', 'Legal']) {
      expect(within(footer()).getByText(heading)).toBeTruthy()
    }
    expect(hrefsIn(footer())).toContain('/privacy-policy')
    expect(hrefsIn(footer())).toContain('/terms-and-conditions')
    expect(hrefsIn(footer())).toContain('/auth/sign-in')
  })
})

describe('the header, signed in', () => {
  beforeEach(asCustomer)

  test('swaps the Sign in link for the avatar menu', () => {
    shell()
    expect(within(header()).queryByText('Sign in')).toBeNull()
    expect(screen.getAllByLabelText('Account menu').length).toBeGreaterThan(0)
    expect(within(header()).getAllByText('DD').length).toBeGreaterThan(0)
  })

  test('the menu is Account, the two Settings screens and Sign out', () => {
    shell()
    const menu = openAccountMenu()
    expect(within(menu).getByText('Account')).toBeTruthy()
    expect(within(menu).getByText('Dana Doe')).toBeTruthy()
    expect(within(menu).getByText('Settings')).toBeTruthy()
    expect(hrefsIn(menu)).toEqual(['/settings/email', '/settings/phone'])

    fireEvent.click(within(menu).getByText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  test('a customer is offered no Admin link anywhere', () => {
    shell()
    expect(within(header()).queryByText('Admin')).toBeNull()
    expect(hrefsIn(openDrawer())).toEqual([
      '/how-it-works',
      '/pricing',
      '/about',
      '/contact',
      '/settings/email',
      '/settings/phone',
    ])
  })

  test('the footer does not change with the session', () => {
    shell()
    expect(hrefsIn(footer())).not.toContain('/settings/email')
  })
})

describe('the header, signed in as an admin', () => {
  beforeEach(asAdmin)

  test('the account menu gains Admin, pointing at the admin index', () => {
    shell()
    expect(within(header()).queryByText('Admin')).toBeNull()
    expect(hrefsIn(openAccountMenu())).toEqual(['/admin', '/settings/email', '/settings/phone'])
  })

  test('the drawer carries the nav and the account entries together', () => {
    shell()
    const panel = openDrawer()
    expect(hrefsIn(panel)).toEqual([
      '/how-it-works',
      '/pricing',
      '/about',
      '/contact',
      '/admin',
      '/settings/email',
      '/settings/phone',
    ])
    fireEvent.click(within(panel).getByText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

describe('the messages indicator', () => {
  const openMessages = () => {
    fireEvent.keyDown(screen.getByTestId('messages-menu'), { key: 'Enter' })
    return document.body.querySelector('[role="menu"]') as HTMLElement
  }

  test('is absent when no fake channel is active', () => {
    asCustomer()
    shell()
    expect(screen.queryByTestId('messages-menu')).toBeNull()
  })

  test('is absent when signed out, even with the fakes on', () => {
    fakes.data = { sms: true, email: true }
    shell()
    expect(screen.queryByTestId('messages-menu')).toBeNull()
  })

  test('shows a count and lists the messages, each opening in a new tab', () => {
    asAdmin()
    fakes.data = { sms: true, email: false }
    inbox.data = [
      {
        message_id: 'SMfake2',
        channel: 'sms',
        to: '+15125550199',
        subject: null,
        preview: 'Your Dorado code is 481920.',
        sent_at: '2026-10-13T14:05:00.000Z',
      },
      {
        message_id: 'fake-1@dorado.invalid',
        channel: 'email',
        to: 'jacob@example.invalid',
        subject: 'Order received',
        preview: null,
        sent_at: '2026-10-13T14:00:00.000Z',
      },
    ]
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    shell()
    expect(screen.getByTestId('messages-count').textContent).toBe('2')
    expect(inbox.refetchInterval).toBe(false)

    const menu = openMessages()
    expect(inbox.refetchInterval).toBe(10_000)
    const items = within(menu).getAllByTestId('messages-item')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Your Dorado code is 481920.'),
      expect.stringContaining('Order received'),
    ])
    fireEvent.click(items[1])
    expect(open).toHaveBeenCalledWith(
      '/api/account/messages/fake-1%40dorado.invalid',
      '_blank',
      'noopener'
    )
    open.mockRestore()
  })
})
