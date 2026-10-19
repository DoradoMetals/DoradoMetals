import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { LineChart } from './Chart'
import { expectNoAxeViolations } from '../test/axe'

function renderRange(onRangeChange = vi.fn()) {
  const utils = render(
    <LineChart
      labels={['a', 'b']}
      series={[{ label: 'Gold', data: [1, 2] }]}
      label="Gold price"
      title="Spot price"
      range="1W"
      onRangeChange={onRangeChange}
    />
  )
  return { ...utils, onRangeChange }
}

describe('Chart range accessibility', () => {
  it('is a radiogroup with one tab stop on the chosen range (roving tabindex)', async () => {
    const { getByRole, getAllByRole, container } = renderRange()
    getByRole('radiogroup', { name: 'Range' })
    const radios = getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
    expect(getByRole('radio', { name: '1W' }).getAttribute('aria-checked')).toBe('true')
    await expectNoAxeViolations(container)
  })

  it('arrow keys, Home and End move focus and choose the range', () => {
    const { getByRole, onRangeChange } = renderRange()
    const week = getByRole('radio', { name: '1W' })
    week.focus()
    fireEvent.keyDown(week, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(getByRole('radio', { name: '1M' }))
    expect(onRangeChange).toHaveBeenLastCalledWith('1M')
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' })
    expect(onRangeChange).toHaveBeenLastCalledWith('1Y')
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect(onRangeChange).toHaveBeenLastCalledWith('1D')
    const calls = onRangeChange.mock.calls.length
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    expect(onRangeChange).toHaveBeenCalledTimes(calls)
    expect(document.activeElement).toBe(getByRole('radio', { name: '1D' }))
  })
})
