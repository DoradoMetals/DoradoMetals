import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { LotPhotos } from '../LotPhotos'

const photo = (n: number) => ({ url: `https://img.test/${n}.jpg` })

describe('LotPhotos', () => {
  test('Count=None: one disabled empty thumbnail', () => {
    const { container } = render(<LotPhotos photos={[]} label="Lot 2481-A" />)
    expect(container.querySelector('[data-count="none"]')).toBeTruthy()
    expect(screen.getByLabelText('No photos of Lot 2481-A')).toBeTruthy()
  })

  test('Count=One', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <LotPhotos photos={[photo(1)]} label="Lot 2481-A" onOpen={onOpen} />
    )
    expect(container.querySelector('[data-count="one"]')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Open photo 1 of Lot 2481-A'))
    expect(onOpen).toHaveBeenCalledWith(0)
  })

  test('Count=Several shows every thumbnail up to the max', () => {
    const { container } = render(
      <LotPhotos photos={[photo(1), photo(2), photo(3)]} label="Lot 2481-A" />
    )
    expect(container.querySelector('[data-count="several"]')).toBeTruthy()
    expect(screen.getAllByLabelText(/^Open photo/)).toHaveLength(3)
  })

  test('Count=More caps the row and counts the rest', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <LotPhotos photos={[1, 2, 3, 4, 5].map(photo)} label="Lot 2481-A" onOpen={onOpen} />
    )
    expect(container.querySelector('[data-count="more"]')).toBeTruthy()
    expect(screen.getAllByLabelText(/^Open photo/)).toHaveLength(3)
    fireEvent.click(screen.getByLabelText('2 more photos of Lot 2481-A'))
    expect(onOpen).toHaveBeenCalledWith(3)
  })

  test('Count=Uploading: faded tiles, a spinner and the uploading count', () => {
    const { container } = render(<LotPhotos photos={[]} uploading={1} label="Lot 2481-A" />)
    expect(container.querySelector('[data-count="uploading"]')).toBeTruthy()
    expect(screen.getByLabelText('Uploading photo of Lot 2481-A')).toBeTruthy()
    expect(screen.getByText('1 uploading')).toBeTruthy()
  })
})
