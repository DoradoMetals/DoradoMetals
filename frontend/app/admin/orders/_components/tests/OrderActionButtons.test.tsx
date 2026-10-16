import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { OrderActionButtons, offeredActions } from '../OrderActionButtons'

const act = (name: string) => ({ name, confirm: null, override: null })
const looks = {
  cancel: { label: 'Cancel', variant: 'secondary' as const, intent: 'danger' as const },
  finalize: { label: 'Finalize', variant: 'primary' as const },
}

describe('OrderActionButtons', () => {
  it('draws only offered actions, in look order, and reports the click', () => {
    const onAction = vi.fn()
    render(
      <OrderActionButtons
        actions={[act('finalize'), act('other')]}
        looks={looks}
        onAction={onAction}
      />
    )
    expect(screen.queryByText('Cancel')).toBeNull()
    fireEvent.click(screen.getByText('Finalize'))
    expect(onAction).toHaveBeenCalledWith(act('finalize'))
  })

  it('draws nothing when no action is offered', () => {
    const { container } = render(
      <OrderActionButtons actions={[]} looks={looks} onAction={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
    expect(offeredActions([], looks)).toEqual([])
  })

  it('pending and enabled=false disable a button', () => {
    const { rerender } = render(
      <OrderActionButtons
        actions={[act('finalize')]}
        looks={looks}
        onAction={vi.fn()}
        pending="finalize"
      />
    )
    expect((screen.getByText('Finalize').closest('button') as HTMLButtonElement).disabled).toBe(
      true
    )
    rerender(
      <OrderActionButtons
        actions={[{ ...act('finalize'), enabled: false }]}
        looks={looks}
        onAction={vi.fn()}
      />
    )
    expect((screen.getByText('Finalize').closest('button') as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('mobile stacks full width in reverse order', () => {
    const { container } = render(
      <OrderActionButtons
        actions={[act('cancel'), act('finalize')]}
        looks={looks}
        onAction={vi.fn()}
        layout="mobile"
      />
    )
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(['Finalize', 'Cancel'])
    expect(container.querySelector('button')!.className).toContain('w-full')
  })

  it('bare returns the buttons without a wrapper', () => {
    const { container } = render(
      <OrderActionButtons bare actions={[act('finalize')]} looks={looks} onAction={vi.fn()} />
    )
    expect(container.querySelector('[data-layout]')).toBeNull()
    expect(container.querySelectorAll('button').length).toBe(1)
  })
})
