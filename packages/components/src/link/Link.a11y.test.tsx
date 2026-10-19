import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Link } from './Link'
import { expectNoAxeViolations } from '../test/axe'

describe('Link accessibility', () => {
  it('keeps a visible focus ring, not only an underline', async () => {
    const { getByRole, container } = render(
      <p>
        <Link href="/a">Account</Link>{' '}
        <Link href="https://x.test" external>
          Docs
        </Link>
      </p>
    )
    for (const name of ['Account', 'Docs']) {
      const link = getByRole('link', { name })
      expect(link.className).toContain('focus-ring')
      expect(link.className).not.toContain('focus-visible:outline-none')
    }
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    await expectNoAxeViolations(container)
  })

  it('the nav variant marks the active page', () => {
    const { getByRole } = render(
      <Link href="/orders" variant="nav" active>
        Orders
      </Link>
    )
    expect(getByRole('link', { name: 'Orders' }).getAttribute('aria-current')).toBe('page')
  })
})
