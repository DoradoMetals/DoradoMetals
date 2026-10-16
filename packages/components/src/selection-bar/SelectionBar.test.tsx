import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { SelectionBar } from './SelectionBar'
import { axeViolations } from '../test/axe'

describe('SelectionBar', () => {
  it('shows summary, totals and actions, and dismiss only with a handler', async () => {
    const onDismiss = vi.fn()
    const { getByText, getByRole, queryByRole, container, rerender } = render(
      <SelectionBar
        summary="2 orders selected"
        totals="10 lots"
        actions={<button>Batch</button>}
        onDismiss={onDismiss}
      />
    )
    expect(getByText('2 orders selected')).toBeTruthy()
    expect(getByText('10 lots').className).toContain('text-subtle')
    expect(getByText('Batch')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Clear selection' }))
    expect(onDismiss).toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
    rerender(<SelectionBar summary="x" />)
    expect(queryByRole('button')).toBeNull()
  })

  it('is fixed to the bottom on the raised surface with a top hairline', () => {
    const { getByRole } = render(<SelectionBar summary="x" />)
    const cls = getByRole('region').className
    expect(cls).toContain('fixed')
    expect(cls).toContain('bottom-0')
    expect(cls).toContain('bg-surface-raised')
    expect(cls).toContain('border-t')
    expect(cls).toContain('var(--floating-shadow)')
  })

  it('mobile stacks and fills the actions', () => {
    const { getByRole, getByText } = render(
      <SelectionBar summary="x" layout="mobile" actions={<button>Go</button>} />
    )
    expect(getByRole('region').firstElementChild!.className).toContain('flex-col')
    expect(getByText('Go').parentElement!.className).toContain('w-full')
  })
})
