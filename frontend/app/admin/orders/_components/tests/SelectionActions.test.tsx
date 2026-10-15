import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { SelectionActions, type SelectionAction } from '../SelectionActions'

function actions(over: Partial<SelectionAction>[] = []): SelectionAction[] {
  return [
    {
      name: 'batch',
      label: 'Batch into',
      submitLabel: 'Batch',
      items: [{ value: 'elemetal', label: 'Elemetal · Dallas' }],
      value: 'elemetal',
      onValueChange: () => {},
      onSubmit: () => {},
      enabled: true,
      ...over[0],
    },
    {
      name: 'send',
      label: 'Send to',
      submitLabel: 'Send',
      items: [{ value: 'inventory', label: 'Inventory' }],
      value: 'inventory',
      onValueChange: () => {},
      onSubmit: () => {},
      enabled: true,
      ...over[1],
    },
  ]
}

function bar(list: SelectionAction[], layout: 'desktop' | 'mobile' = 'desktop') {
  return render(
    <SelectionActions
      layout={layout}
      summary="2 orders selected · 10 lots"
      totals="$15,532.70 est. · 6.18 oz fine gold"
      actions={list}
      onDismiss={() => {}}
    />
  )
}

describe('SelectionActions', () => {
  it('All enabled (1035:21970) shows summary, totals, both actions and buttons', async () => {
    const { container, getByText, getByRole } = bar(actions())
    expect(getByText('2 orders selected · 10 lots')).toBeTruthy()
    expect(getByText('$15,532.70 est. · 6.18 oz fine gold')).toBeTruthy()
    expect(getByText('Batch into')).toBeTruthy()
    expect(getByText('Send to')).toBeTruthy()
    expect((getByRole('button', { name: 'Batch' }) as HTMLButtonElement).disabled).toBe(false)
    expect((getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Send unavailable (1202:23094) disables Send and says why', () => {
    const { getByRole, getByText, queryByText } = bar(
      actions([{}, { enabled: false, reason: 'PO-2492 has not arrived yet.' }])
    )
    expect((getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: 'Batch' }) as HTMLButtonElement).disabled).toBe(false)
    expect(getByText('PO-2492 has not arrived yet.')).toBeTruthy()
    expect(queryByText('PO-2488 has no unassigned lots.')).toBeNull()
  })

  it('an enabled action hides its reason', () => {
    const { queryByText } = bar(actions([{ reason: 'hidden' }]))
    expect(queryByText('hidden')).toBeNull()
  })

  it('submit reports; pending disables', () => {
    const onSubmit = vi.fn()
    const { getByRole, rerender } = bar(actions([{ onSubmit }]))
    fireEvent.click(getByRole('button', { name: 'Batch' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    rerender(<SelectionActions summary="s" actions={actions([{ pending: true }])} />)
    expect((getByRole('button', { name: 'Batch' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('mobile (917:13005) stacks with large full-width buttons', () => {
    const { container, getByRole } = bar(actions(), 'mobile')
    expect(container.querySelector('[data-layout="mobile"]')).toBeTruthy()
    expect(getByRole('button', { name: 'Batch' }).className).toContain('min-h-(--control-lg)')
  })

  it('dismiss clears the selection', () => {
    const onDismiss = vi.fn()
    const { getByRole } = render(
      <SelectionActions summary="s" actions={[]} onDismiss={onDismiss} />
    )
    fireEvent.click(getByRole('button', { name: 'Clear selection' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
