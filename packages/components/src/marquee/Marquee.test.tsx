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

  it('keeps both moving tracks on the compositor and animates the tracks, not the scroller', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    const tracks = container.querySelectorAll('.motion-safe\\:animate-marquee')
    expect(tracks).toHaveLength(2)
    tracks.forEach((t) => {
      expect(t.className).toContain('will-change-transform')
      expect(t.className).toContain('transform-gpu')
    })
    const section = container.firstElementChild as HTMLElement
    expect(section.className).toContain('motion-safe:overflow-hidden')
    expect(section.className).not.toContain('animate-marquee')
  })

  it('insets the band px-lg, matching the drawing', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    expect(container.firstElementChild!.className).toContain('px-lg')
    expect(container.firstElementChild!.className).toContain('bg-background')
  })
})

describe('Marquee at Layout=Desktop', () => {
  it('sits its cells right with the leading control on the far left', () => {
    const { getByRole, getByText } = render(
      <Marquee
        layout="desktop"
        label="Live spot prices"
        leading={<button aria-label="Show bid">Show bid</button>}
      >
        <span>Gold</span>
      </Marquee>
    )
    const row = getByRole('region', { name: 'Live spot prices' }).firstElementChild as HTMLElement
    expect(row.firstElementChild?.textContent).toBe('Show bid')
    const cells = getByText('Gold').parentElement as HTMLElement
    expect(cells.className).toContain('ml-auto')
    expect(cells.className).toContain('gap-2xl')
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
    expect(bar.className).toContain('bg-background')
    const row = bar.firstElementChild as HTMLElement
    expect(row.className).toContain('max-w-page')
    expect(row.className).toContain('px-lg')
    expect(row.className).toContain('py-sm')
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

  it('drops the hairlines when showBorders is off', () => {
    const on = render(
      <Marquee layout="desktop" label="On">
        <span>a</span>
      </Marquee>
    )
    expect(on.getByRole('region', { name: 'On' }).className).toContain('border-y')
    const off = render(
      <Marquee layout="desktop" label="Off" showBorders={false}>
        <span>a</span>
      </Marquee>
    )
    expect(off.getByRole('region', { name: 'Off' }).className).not.toContain('border-y')
    const mob = render(
      <Marquee label="Mob" showBorders={false}>
        <span>a</span>
      </Marquee>
    )
    expect(mob.getByRole('region', { name: 'Mob' }).className).not.toContain('border-y')
  })
})
