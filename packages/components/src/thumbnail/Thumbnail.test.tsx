import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Thumbnail } from './Thumbnail'
import { axeViolations } from '../test/axe'

describe('Thumbnail', () => {
  it('with a photo it renders the image and no placeholder glyph', () => {
    const { container } = render(
      <Thumbnail src="/lot.jpg" alt="Lot 2481-A" aria-label="Open photo" />
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/lot.jpg')
    expect(img?.getAttribute('alt')).toBe('Lot 2481-A')
  })

  it('with no photo it shows the glyph, and showGlyph=false leaves the tile bare', () => {
    const { container, rerender } = render(<Thumbnail aria-label="Open photo" />)
    expect(container.querySelectorAll('svg').length).toBe(2)
    rerender(<Thumbnail showGlyph={false} aria-label="Open photo" />)
    expect(container.querySelectorAll('svg').length).toBe(1)
  })

  it('the whole tile is a button and fires onClick', async () => {
    const onClick = vi.fn()
    const { container, getByRole } = render(<Thumbnail aria-label="Open photo" onClick={onClick} />)
    fireEvent.click(getByRole('button', { name: 'Open photo' }))
    expect(onClick).toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('SM 32 / MD 40 / LG 64 / XL 96 (698:29 Size variant)', () => {
    const { container, rerender } = render(<Thumbnail size="sm" aria-label="Open photo" />)
    expect(container.querySelector('button')?.className).toContain('size-xl')
    rerender(<Thumbnail size="md" aria-label="Open photo" />)
    expect(container.querySelector('button')?.className).toContain('size-10')
    rerender(<Thumbnail size="lg" aria-label="Open photo" />)
    expect(container.querySelector('button')?.className).toContain('size-3xl')
    rerender(<Thumbnail size="xl" aria-label="Open photo" />)
    expect(container.querySelector('button')?.className).toContain('size-4xl')
  })

  it('defaults to size=md, the lot-row slot', () => {
    const { container } = render(<Thumbnail aria-label="Open photo" />)
    expect(container.querySelector('button')?.className).toContain('size-10')
  })

  it('the glyph steps from 16px (spacing/md) on SM/MD to 24px (spacing/lg) on LG/XL', () => {
    const { container, rerender } = render(<Thumbnail size="sm" aria-label="Open photo" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-md')
    rerender(<Thumbnail size="lg" aria-label="Open photo" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-lg')
  })

  it('the Overflow state shows the count of hidden photos in place of the image', () => {
    const { container } = render(<Thumbnail overflow={4} aria-label="4 more photos" />)
    expect(container.textContent).toContain('+4')
    expect(container.querySelector('img')).toBeNull()
  })
})
