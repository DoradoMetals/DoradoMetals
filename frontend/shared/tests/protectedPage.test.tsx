import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const replace = vi.fn()
let session: Record<string, unknown> = {}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/orders',
}))
vi.mock('@/shared/hooks/auth/queries', () => ({ useGetSession: () => session }))

import ProtectedPage from '../hooks/useProtectedPage'

const mount = () =>
  render(
    <ProtectedPage requiredRoles={['admin']}>
      <p>secret</p>
    </ProtectedPage>
  )

beforeEach(() => replace.mockClear())

describe('ProtectedPage', () => {
  test('a failed session fetch does not redirect to sign-in', () => {
    session = { user: undefined, error: { status: 503 }, isPending: false }
    mount()
    expect(replace).not.toHaveBeenCalled()
  })
  test('a failed refetch after a good session keeps the page', () => {
    session = { user: { role: 'admin' }, error: null, isPending: false }
    const view = mount()
    expect(screen.getByText('secret')).toBeTruthy()
    session = { user: undefined, error: { status: 503 }, isPending: false }
    view.rerender(
      <ProtectedPage requiredRoles={['admin']}>
        <p>secret</p>
      </ProtectedPage>
    )
    expect(screen.getByText('secret')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })
  test('a definitive signed-out answer redirects', () => {
    session = { user: undefined, error: null, isPending: false }
    mount()
    expect(replace).toHaveBeenCalled()
  })
})
