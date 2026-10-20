import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ApiError } from '@dorado/client'

import { NewLeadDrawer } from '../NewLeadDrawer'

const props = {
  open: true,
  setOpen: vi.fn(),
  sources: [],
  preferences: [],
  assignees: [],
  onCreate: vi.fn(),
}

describe('the New lead drawer', () => {
  test('a 409 shows the banner and puts the phone in error', async () => {
    render(<NewLeadDrawer {...props} error={new ApiError(409, 'taken', null)} />)
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Could not create the lead')).toBeTruthy()
    expect(within(drawer).getByText('A lead with this phone number already exists.')).toBeTruthy()
  })

  test('another failure shows the banner and leaves the phone alone', async () => {
    render(
      <NewLeadDrawer {...props} error={new ApiError(500, 'phone number already exists', null)} />
    )
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Could not create the lead')).toBeTruthy()
    expect(within(drawer).queryByText('A lead with this phone number already exists.')).toBeNull()
  })

  test('Saving disables the form and says Creating…', async () => {
    render(<NewLeadDrawer {...props} pending />)
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Creating…')).toBeTruthy()
    expect(within(drawer).getByLabelText('Name').hasAttribute('disabled')).toBe(true)
  })
})
