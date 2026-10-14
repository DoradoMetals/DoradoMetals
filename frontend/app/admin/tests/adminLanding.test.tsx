import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { default: Page } = await import('../page')

describe('the admin landing', () => {
  test('Orders, Inventory and People are disabled; Pricing goes to /admin/pricing', () => {
    render(<Page />)

    for (const name of ['Orders', 'Inventory', 'People']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }))
    expect(push).toHaveBeenCalledWith('/admin/pricing')
  })
})
