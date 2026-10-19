import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Swiper } from './Swiper'
import { expectNoAxeViolations } from '../test/axe'

describe('Swiper accessibility', () => {
  it('the scroll region is focusable, named and shows the focus ring', async () => {
    const { getByRole, container } = render(
      <Swiper label="Featured">
        <div>One</div>
        <div>Two</div>
      </Swiper>
    )
    const region = getByRole('region', { name: 'Featured' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.className).toContain('focus-ring')
    await expectNoAxeViolations(container)
  })
})
