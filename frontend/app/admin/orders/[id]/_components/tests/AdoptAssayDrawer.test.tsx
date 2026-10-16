import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AdoptAssayDrawer } from '../AdoptAssayDrawer'

describe('AdoptAssayDrawer (1235:25531)', () => {
  test('a drawer titled Adopt refiner assay with Cancel then Adopt', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<AdoptAssayDrawer open candidates={[]} onConfirm={onConfirm} onCancel={onCancel} />)
    const drawer = screen.getByRole('dialog', { name: 'Adopt refiner assay' })
    const labels = Array.from(drawer.querySelectorAll('button'))
      .map((button) => button.textContent?.trim())
      .filter((label) => label === 'Cancel' || label === 'Adopt')
    expect(labels).toEqual(['Cancel', 'Adopt'])
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }))
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  test('Adopt is disabled while the write is pending', () => {
    render(
      <AdoptAssayDrawer open pending candidates={[]} onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'Adopt' })).toHaveProperty('disabled', true)
  })
})
