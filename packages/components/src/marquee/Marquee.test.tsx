import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Marquee } from './Marquee'
import { axeViolations } from '../test/axe'

describe('Marquee', () => {
  it('renders children once for AT - the seam copy is aria-hidden', async () => {
    const { container, getAllByText } = render(
      <Marquee>
        <span>Gold $2,411.20</span>
      </Marquee>
    )
    expect(getAllByText('Gold $2,411.20').length).toBe(2)
    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden?.textContent).toContain('Gold')
    expect(await axeViolations(container)).toEqual([])
  })

  it('pauses on hover/focus and only animates motion-safe', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    const track = container.querySelector('.motion-safe\\:animate-marquee') as HTMLElement
    expect(track).toBeTruthy()
    expect(track.className).toContain('group-hover:[animation-play-state:paused]')
    expect(track.className).toContain('group-focus-within:[animation-play-state:paused]')
  })

  it('insets the band px-lg, matching the drawing', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    expect(container.firstElementChild!.className).toContain('px-lg')
  })
})

describe('Marquee at Layout=Desktop', () => {
  it('sits its cells right with the leading control on the far left', () => {
    const { getByRole, getByText } = render(
      <Marquee layout="desktop" label="Live spot prices" leading={<button>Show bid/ask</button>}>
        <span>Gold</span>
      </Marquee>
    )
    const row = getByRole('region', { name: 'Live spot prices' }).firstElementChild as HTMLElement
    expect(row.firstElementChild?.textContent).toBe('Show bid/ask')
    const cells = getByText('Gold').parentElement as HTMLElement
    expect(cells.className).toContain('ml-auto')
    expect(cells.className).toContain('gap-xl')
  })

  it('is a static row inside the page width, with no seam copy and no motion', () => {
    const { container, getAllByText } = render(
      <Marquee layout="desktop" label="Live spot prices">
        <span>Gold $2,411.20</span>
      </Marquee>
    )
    expect(getAllByText('Gold $2,411.20').length).toBe(1)
    expect(container.querySelector('.motion-safe\\:animate-marquee')).toBeNull()
    const bar = container.firstElementChild as HTMLElement
    expect(bar.className).toContain('h-(--control-lg)')
    const row = bar.firstElementChild as HTMLElement
    expect(row.className).toContain('max-w-page')
    expect(row.className).toContain('px-lg')
  })

  it('under reduced motion the mobile band is a static, scrollable row', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    const band = container.firstElementChild as HTMLElement
    expect(band.className).toContain('overflow-x-auto')
    expect(band.className).toContain('motion-safe:overflow-hidden')
    const seam = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(seam.className).toContain('hidden')
    expect(seam.className).toContain('motion-safe:flex')
  })
})
