import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Hero, type HeroProps } from './Hero'
import { axeViolations } from '../test/axe'

const actions: Pick<HeroProps, 'primaryAction' | 'secondaryAction'> = {
  primaryAction: { href: '/sign-in', label: 'Get a Quote' },
  secondaryAction: { href: '/catalogue', label: 'Browse bullion' },
}

describe('Hero', () => {
  it('the title is a real h1, and axe finds nothing', async () => {
    const { container, getByRole } = render(<Hero sellerCount={2400} {...actions} />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'Sell your precious metals without the guesswork'
    )
    expect(await axeViolations(container)).toEqual([])
  })

  it('both CTAs are the CALLER\'s - no route is baked into the component', () => {
    const { getByRole } = render(
      <Hero
        sellerCount={2400}
        primaryAction={{ href: '/sign-in', label: 'Start selling' }}
        secondaryAction={{ href: 'https://example.com/catalogue', label: 'Browse bullion' }}
      />
    )
    expect(getByRole('link', { name: 'Start selling' }).getAttribute('href')).toBe('/sign-in')
    expect(getByRole('link', { name: 'Browse bullion' }).getAttribute('href')).toBe(
      'https://example.com/catalogue'
    )
  })

  it('the secondary CTA is optional - one button is a whole hero', () => {
    const { getAllByRole, queryByRole } = render(
      <Hero sellerCount={2400} primaryAction={{ href: '/sign-in', label: 'Get a Quote' }} />
    )
    expect(getAllByRole('link')).toHaveLength(1)
    expect(queryByRole('link', { name: 'Browse bullion' })).toBeNull()
  })

  it("renders the caller's count, grouped", () => {
    const { container } = render(<Hero sellerCount={2400} {...actions} />)
    expect(container.textContent).toContain('Trusted by 2,400+ sellers')
    const { container: other } = render(<Hero sellerCount={11750} {...actions} />)
    expect(other.textContent).toContain('Trusted by 11,750+ sellers')
  })

  it('the headline is Heading/H1 (163:35, resolved 2026-09-03) - no Display escalation left', () => {
    const { getByRole } = render(<Hero sellerCount={2400} {...actions} />)
    const heading = getByRole('heading', { level: 1 })
    expect(heading.tagName.toLowerCase()).toBe('h1')
    expect(heading.className).not.toMatch(/text-h|font-/)
    expect(heading.className).not.toContain('text-display')
  })

  it('column gap and desktop padding are Scale tokens, not raw Tailwind numerics', () => {
    const { container } = render(<Hero sellerCount={2400} {...actions} />)
    const section = container.querySelector('section')!
    expect(section.className).toContain('gap-md')
    expect(section.className).toContain('sm:p-3xl')
    expect(section.className).not.toContain('gap-5')
    expect(section.className).not.toContain('sm:p-24')
  })
})
