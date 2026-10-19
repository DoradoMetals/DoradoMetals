import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Carousel } from './Carousel'
import { expectNoAxeViolations } from '../test/axe'

const slides = (n: number) =>
  Array.from({ length: n }, (_, i) => <div key={i}>Slide body {i + 1}</div>)

describe('Carousel accessibility', () => {
  it('each slide is a group announced as a slide with its position', async () => {
    const { getAllByRole, container } = render(<Carousel label="Products">{slides(3)}</Carousel>)
    const groups = getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3'])
    expect(groups.every((g) => g.getAttribute('aria-roledescription') === 'slide')).toBe(true)
    await expectNoAxeViolations(container)
  })

  it('arrow keys, Home and End page the focused carousel', () => {
    const { getByRole } = render(<Carousel label="Products">{slides(3)}</Carousel>)
    const region = getByRole('region', { name: 'Products' })
    const dot = (n: number) => getByRole('button', { name: `Go to slide ${n} of 3` })
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(dot(2).getAttribute('aria-current')).toBe('true')
    fireEvent.keyDown(region, { key: 'End' })
    expect(dot(3).getAttribute('aria-current')).toBe('true')
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(dot(2).getAttribute('aria-current')).toBe('true')
    fireEvent.keyDown(region, { key: 'Home' })
    expect(dot(1).getAttribute('aria-current')).toBe('true')
  })

  it('the dots show the focus ring, hit only their own box and stop animating under reduced motion', () => {
    const { getByRole } = render(<Carousel label="Products">{slides(2)}</Carousel>)
    const dot = getByRole('button', { name: 'Go to slide 1 of 2' })
    expect(dot.className).toContain('focus-ring')
    expect(dot.className).not.toContain('hit-area')
    expect(dot.className).toContain('motion-reduce:transition-none')
  })
})
