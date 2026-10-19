import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Estimator } from './Estimator'
import { expectNoAxeViolations } from '../test/axe'

const base = {
  type: {
    options: [
      { value: 'scrap', label: 'Scrap' },
      { value: 'bullion', label: 'Bullion' },
    ],
    value: 'scrap',
  },
  metal: {
    options: [
      { value: 'gold', label: 'Gold' },
      { value: 'silver', label: 'Silver' },
    ],
    value: 'gold',
  },
  weight: {
    value: '',
    onValueChange: () => {},
    unit: {
      options: [
        { value: 'g', label: 'Grams' },
        { value: 'ozt', label: 'Troy Oz' },
      ],
      value: 'g',
    },
  },
  purity: {
    options: [
      { value: '14k', label: '14K' },
      { value: '24k', label: '24K' },
    ],
    value: '14k',
  },
}

describe('Estimator', () => {
  it('renders eyebrow, labels, chips and an estimate figure it was handed', async () => {
    const { getByText, getByRole, container } = render(
      <Estimator {...base} estimate="$1,234.00" eyebrow="New item" />
    )
    expect(getByText('New item').className).toContain('eyebrow')
    expect(getByText('Type')).toBeTruthy()
    expect(getByText('Purity')).toBeTruthy()
    expect(getByRole('radio', { name: 'Gold' }).getAttribute('aria-checked')).toBe('true')
    expect(getByText('$1,234.00')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('relabels through props and reports changes', () => {
    const onValueChange = vi.fn()
    const onAdd = vi.fn()
    const { getByText, getByRole } = render(
      <Estimator
        {...base}
        metalLabel="Which metal"
        metal={{ ...base.metal, onValueChange }}
        onAdd={onAdd}
      />
    )
    expect(getByText('Which metal')).toBeTruthy()
    fireEvent.click(getByRole('radio', { name: 'Silver' }))
    expect(onValueChange).toHaveBeenCalledWith('silver')
    fireEvent.click(getByRole('button', { name: 'Add to estimate' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('mobile orders blocks Type, Metal, Weight, Purity in one column', () => {
    const { container } = render(<Estimator {...base} layout="mobile" />)
    const labels = Array.from(container.querySelectorAll('p.text-small.font-medium')).map(
      (p) => p.textContent
    )
    expect(labels).toEqual(['Type', 'Metal', 'Weight', 'Purity'])
    expect(container.firstElementChild!.getAttribute('data-layout')).toBe('mobile')
  })

  it('shows the purity slider only when asked', () => {
    const { queryByRole, rerender } = render(<Estimator {...base} />)
    expect(queryByRole('slider')).toBeNull()
    rerender(
      <Estimator {...base} purity={{ ...base.purity, percent: 60, onPercentChange: () => {} }} />
    )
    expect(queryByRole('slider')).toBeTruthy()
  })
})
