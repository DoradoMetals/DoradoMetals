import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Button } from './Button'
import { expectNoAxeViolations } from '../test/axe'

const SIZES = ['xs', 'sm', 'default', 'lg', 'xl', 'icon', 'iconSm', 'iconXs', 'iconInline'] as const

describe('Button accessibility', () => {
  it('every size and emphasis shows the theme focus ring through focus-visible', async () => {
    const { getAllByRole, container } = render(
      <>
        {(['primary', 'secondary', 'tertiary', 'subtle'] as const).map((variant) => (
          <Button key={variant} variant={variant} aria-label={variant}>
            {variant}
          </Button>
        ))}
      </>
    )
    for (const button of getAllByRole('button')) {
      expect(button.className).toContain('focus-ring')
      expect(button.className).not.toContain('focus-visible:ring-')
    }
    await expectNoAxeViolations(container)
  })

  it('every size carries a 44px touch hit area without changing its drawn box', () => {
    const { getAllByRole } = render(
      <>
        {SIZES.map((size) => (
          <Button key={size} size={size} aria-label={size}>
            x
          </Button>
        ))}
      </>
    )
    for (const button of getAllByRole('button')) {
      expect(button.className).toContain('hit-area')
      expect(button.className).toContain('relative')
    }
  })

  it('hitArea={false} drops the overlay for buttons packed tighter than 44px', () => {
    const { getByRole } = render(
      <Button size="iconSm" aria-label="Next" hitArea={false}>
        x
      </Button>
    )
    expect(getByRole('button', { name: 'Next' }).className).not.toContain('hit-area')
  })

  it('a call-site position still wins over the hit-area anchor', () => {
    const { getByRole } = render(
      <Button size="iconSm" aria-label="Close" className="absolute right-md top-md">
        x
      </Button>
    )
    const button = getByRole('button', { name: 'Close' })
    expect(button.className).toContain('absolute')
    expect(button.className.split(' ')).not.toContain('relative')
  })
})
