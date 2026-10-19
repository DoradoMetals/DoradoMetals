import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Link } from './Link'
import { expectNoAxeViolations } from '../test/axe'

describe('Link', () => {
  it('is a real anchor, and axe finds nothing', async () => {
    const { getByRole, container } = render(<Link href="/rates">Live rates</Link>)
    const a = getByRole('link', { name: 'Live rates' }) as HTMLAnchorElement
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('/rates')
    await expectNoAxeViolations(container)
  })

  it('asChild lends the styling to a routing anchor', () => {
    const { getByRole } = render(
      <Link asChild>
        <a href="/account">Account</a>
      </Link>
    )
    expect((getByRole('link') as HTMLAnchorElement).getAttribute('href')).toBe('/account')
  })

  it("uses the theme's text-small token", () => {
    const { getByRole } = render(<Link href="/rates">Live rates</Link>)
    expect(getByRole('link').className).toContain('text-small')
  })

  it('aria-disabled dims and blocks the pointer', () => {
    const { getByRole } = render(
      <Link href="/rates" aria-disabled="true">
        Live rates
      </Link>
    )
    expect(getByRole('link').className).toContain('aria-disabled:opacity-50')
    expect(getByRole('link').className).toContain('aria-disabled:pointer-events-none')
  })

  it('external renders a leading 12px icon with a 4px gap (26:513, 2026-10-09)', () => {
    const { getByRole, container } = render(
      <Link href="https://example.com" external>
        Docs
      </Link>
    )
    expect(getByRole('link').className).toContain('gap-2xs')
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-3')
  })

  it('intent=subtle sits on text/subtle, added 2026-10-07 (26:513)', () => {
    const { getByRole } = render(
      <Link href="/orders" intent="subtle">
        View all
      </Link>
    )
    expect(getByRole('link').className).toContain('text-subtle')
  })

  it('rest has no underline; hover and keyboard focus add a 1px underline, on every variant', () => {
    const { getAllByRole } = render(
      <>
        <Link href="/rates">Inline</Link>
        <Link href="/orders" variant="nav">
          Nav
        </Link>
      </>
    )
    for (const link of getAllByRole('link')) {
      const classes = link.className.split(/\s+/)
      expect(classes).toContain('hover:underline')
      expect(classes).toContain('focus-visible:underline')
      expect(classes).toContain('underline-offset-4')
      expect(classes).toContain('decoration-1')
      expect(classes).not.toContain('underline')
    }
  })

  it('the label is Small/Semibold at rest, on hover and when disabled', () => {
    const { getAllByRole } = render(
      <>
        <Link href="/rates">Inline</Link>
        <Link href="/orders" variant="nav">
          Nav
        </Link>
        <Link href="/rates" aria-disabled="true">
          Disabled
        </Link>
      </>
    )
    for (const link of getAllByRole('link')) {
      const classes = link.className.split(/\s+/)
      expect(classes).toContain('font-semibold')
      expect(classes).not.toContain('font-medium')
      expect(classes.some((c) => c.startsWith('hover:font-'))).toBe(false)
    }
  })
})
