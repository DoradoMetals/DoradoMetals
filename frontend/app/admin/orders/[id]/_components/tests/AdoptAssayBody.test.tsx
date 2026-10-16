import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AdoptAssayBody } from '../AdoptAssayBody'
import { candidates } from './detailFixtures'

describe('AdoptAssayBody', () => {
  test('Desktop: own-line and shared-line sections, ours and refiner figures', () => {
    render(<AdoptAssayBody candidates={candidates} lineHref={(l) => `/admin/lines/${l}`} />)
    expect(screen.getByText('From its own line')).toBeTruthy()
    expect(screen.getByText('From a shared line')).toBeTruthy()
    expect(screen.getByText('Ours 139.22 g · 58.3%')).toBeTruthy()
    expect(screen.getByText('Refiner 138.90 g · 58.1%')).toBeTruthy()
    expect(screen.getByText('31% of')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ELM-88433' }).getAttribute('href')).toBe(
      '/admin/lines/ELM-88433'
    )
  })

  test('the inputs start at the proposed figures and an edit reports the merged figures', () => {
    const onFiguresChange = vi.fn()
    render(<AdoptAssayBody candidates={candidates} onFiguresChange={onFiguresChange} />)
    const purity = screen.getByLabelText('Purity, 14K Gold') as HTMLInputElement
    expect(purity.value).toBe('58.1')
    fireEvent.change(purity, { target: { value: '58.4' } })
    fireEvent.blur(purity)
    expect(onFiguresChange).toHaveBeenCalledWith(candidates[0].id, {
      post_melt: 138.9,
      purity: 0.584,
      unit: 'g',
    })
  })

  test('only one section when every candidate is on its own line', () => {
    render(<AdoptAssayBody candidates={[candidates[0]]} />)
    expect(screen.queryByText('From a shared line')).toBeNull()
  })

  test('Mobile: labelled fields with the current figures as the message', () => {
    const { container } = render(<AdoptAssayBody candidates={candidates} layout="mobile" />)
    expect(container.querySelector('[data-layout="mobile"]')).toBeTruthy()
    expect(screen.getAllByText('Purity').length).toBe(2)
    expect(screen.getByText('Ours: 58.3%')).toBeTruthy()
    expect(screen.getByText('Ours: 139.22 g')).toBeTruthy()
  })
})
