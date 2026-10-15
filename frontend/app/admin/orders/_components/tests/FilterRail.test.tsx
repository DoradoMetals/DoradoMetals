import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { FilterRail } from '../FilterRail'
import { Select } from '@dorado/components'

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'value', label: 'Value' },
  { value: 'lots', label: 'Lots' },
]

function rail(extra: Partial<React.ComponentProps<typeof FilterRail>> = {}) {
  return render(
    <FilterRail
      filters={
        <>
          <Select label="Show" items={[{ value: 'u', label: 'Unassigned' }]} />
          <Select label="Payment" items={[{ value: 'any', label: 'Any' }]} />
        </>
      }
      sortOptions={sortOptions}
      sortValue="newest"
      onSortChange={() => {}}
      count="9 orders · 23 unassigned lots"
      onReset={() => {}}
      {...extra}
    />
  )
}

describe('FilterRail', () => {
  it('renders the filter section, sort buttons, count and reset (619:4639)', async () => {
    const { container, getByText, getByRole } = rail()
    expect(getByText('Filter')).toBeTruthy()
    expect(getByText('Sort')).toBeTruthy()
    expect(getByText('9 orders · 23 unassigned lots')).toBeTruthy()
    expect(getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('bg-card')
    expect(container.firstElementChild?.className).toContain('p-md')
  })

  it('the active sort is the primary button, the others secondary', () => {
    const { getByRole } = rail({ sortValue: 'value' })
    expect(getByRole('button', { name: 'Value' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'Value' }).className).toContain('bg-primary')
    expect(getByRole('button', { name: 'Newest' }).getAttribute('aria-pressed')).toBe('false')
    expect(getByRole('button', { name: 'Newest' }).className).not.toContain('bg-primary')
  })

  it('sort and reset report', () => {
    const onSortChange = vi.fn()
    const onReset = vi.fn()
    const { getByRole } = rail({ onSortChange, onReset })
    fireEvent.click(getByRole('button', { name: 'Lots' }))
    fireEvent.click(getByRole('button', { name: 'Reset' }))
    expect(onSortChange).toHaveBeenCalledWith('lots')
    expect(onReset).toHaveBeenCalled()
  })

  it('sort section and foot are optional', () => {
    const { queryByText } = render(<FilterRail filters={<p>x</p>} />)
    expect(queryByText('Sort')).toBeNull()
    expect(queryByText('Reset')).toBeNull()
  })
})
