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

  it('insets the band px-6, matching the drawing', () => {
    const { container } = render(
      <Marquee>
        <span>x</span>
      </Marquee>
    )
    expect(container.firstElementChild!.className).toContain('px-6')
  })
})
