import { describe, expect, it } from 'vitest'

import { SelectionBar } from './SelectionBar'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

describe('SelectionBar', () => {
  it.each(['desktop', 'mobile'] as const)(
    '%s with every slot renders them and axe finds nothing',
    async (layout) => {
      const { container, getByRole, getByText, user } = setup(
        <SelectionBar
          layout={layout}
          summary="3 lots selected"
          totals="12.4 ozt"
          actions={<button type="button">Combine</button>}
          onDismiss={() => {}}
        />
      )
      expect(getByRole('region', { name: 'Selection' }).dataset.layout).toBe(layout)
      expect(getByText('3 lots selected')).toBeTruthy()
      expect(getByText('12.4 ozt')).toBeTruthy()
      expect(getByRole('button', { name: 'Combine' })).toBeTruthy()
      expect(getByRole('button', { name: 'Clear selection' })).toBeTruthy()
      await user.tab()
      expect(document.activeElement).toBe(getByRole('button', { name: 'Clear selection' }))
      await user.tab()
      expect(document.activeElement).toBe(getByRole('button', { name: 'Combine' }))
      await expectNoAxeViolations(container)
    }
  )

  it('a bare summary draws no totals, actions or dismiss', () => {
    const { queryByRole, container } = setup(<SelectionBar summary="Nothing" />)
    expect(queryByRole('button')).toBeNull()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('the default bar keeps its class list', () => {
    const { getByRole } = setup(<SelectionBar summary="1 selected" />)
    expect(classList(getByRole('region'))).toMatchInlineSnapshot(`
      [
        "bg-surface-raised",
        "border-border",
        "border-t",
        "bottom-0",
        "fixed",
        "inset-x-0",
        "shadow-[0_calc(-1*var(--floating-y))_var(--floating-blur)_var(--floating-shadow)]",
        "z-40",
      ]
    `)
  })

  it('dismiss and actions fire by pointer and keyboard; a custom dismiss label names it', async () => {
    let dismissed = 0
    let combined = 0
    const { user, getByRole } = setup(
      <SelectionBar
        summary="2 selected"
        dismissLabel="Deselect all"
        onDismiss={() => dismissed++}
        actions={
          <button type="button" onClick={() => combined++}>
            Combine
          </button>
        }
      />
    )
    await user.click(getByRole('button', { name: 'Deselect all' }))
    await user.tab()
    await user.keyboard('{Enter}')
    expect(dismissed).toBe(1)
    expect(combined).toBe(1)
    await user.keyboard('{Escape}')
    expect(dismissed).toBe(1)
  })
})
