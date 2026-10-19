import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Avatar } from './Avatar'
import { expectNoAxeViolations } from '../test/axe'

describe('Avatar', () => {
  it('shows the fallback when there is no image, and axe finds nothing', async () => {
    const { container, getByText } = render(<Avatar fallback="JJ" />)
    expect(getByText('JJ')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('lg initials use Body/Medium type, not Small', () => {
    const { container } = render(<Avatar size="lg" fallback="JJ" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toMatch(/text-body/)
    expect(root.className).not.toMatch(/text-small/)
  })
})
