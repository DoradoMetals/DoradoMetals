import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import * as React from 'react'

import { OrderContextMenu } from '../OrderContextMenu'

const actions = [
  { name: 'view', label: 'View' },
  { name: 'assign', label: 'Assign to' },
  { name: 'lock_spots', label: 'Lock spots' },
  { name: 'finalize', label: 'Finalize' },
  { name: 'send_payment', label: 'Send payment', disabled: true },
  { name: 'cancel', label: 'Cancel', intent: 'danger' as const },
]

function setup(
  onAction = vi.fn(),
  extra: Partial<React.ComponentProps<typeof OrderContextMenu>> = {}
) {
  const utils = render(
    <OrderContextMenu reference="PO-2481" actions={actions} onAction={onAction} {...extra}>
      <article data-testid="card">card</article>
    </OrderContextMenu>
  )
  return { ...utils, onAction }
}

describe('OrderContextMenu', () => {
  it('stays closed until the card is right-clicked', () => {
    setup()
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('right-click opens the menu (619:4750) labelled with the order and listing the actions', async () => {
    const { getByTestId } = setup()
    fireEvent.contextMenu(getByTestId('card'), { clientX: 40, clientY: 60 })
    await waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeTruthy())
    expect(document.body.textContent).toContain('Order PO-2481')
    const items = [...document.body.querySelectorAll('[role="menuitem"]')]
    expect(items.map((i) => i.textContent)).toEqual(actions.map((a) => a.label))
  })

  it('a disabled action is disabled, the danger action sits after a separator', async () => {
    const { getByTestId } = setup()
    fireEvent.contextMenu(getByTestId('card'))
    await waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeTruthy())
    const send = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (i) => i.textContent === 'Send payment'
    ) as HTMLElement
    expect(send.getAttribute('aria-disabled')).toBe('true')
    const cancel = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (i) => i.textContent === 'Cancel'
    ) as HTMLElement
    expect(cancel.className).toContain('text-destructive')
    expect(cancel.previousElementSibling?.getAttribute('role')).toBe('separator')
  })

  it('choosing an action reports its name and closes', async () => {
    const { getByTestId, onAction } = setup()
    fireEvent.contextMenu(getByTestId('card'))
    await waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeTruthy())
    const finalize = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (i) => i.textContent === 'Finalize'
    ) as HTMLElement
    fireEvent.click(finalize)
    expect(onAction).toHaveBeenCalledWith('finalize')
    await waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeNull())
  })

  it('no actions or disabled leaves the native menu alone', () => {
    const { getByTestId } = setup(vi.fn(), { disabled: true })
    const notPrevented = fireEvent.contextMenu(getByTestId('card'))
    expect(notPrevented).toBe(true)
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })
})
