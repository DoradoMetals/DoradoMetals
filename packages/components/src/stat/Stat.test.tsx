import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Stat } from './Stat'
import { axeViolations } from '../test/axe'

describe('Stat', () => {
  it('renders label and value, and axe finds nothing', async () => {
    const { container, getByText } = render(<Stat label="Gold spot" value="$2,411.20" />)
    expect(getByText('Gold spot')).toBeTruthy()
    expect(getByText('$2,411.20')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('defaults to left alignment', () => {
    const { container } = render(<Stat label="Gold spot" value="$2,411.20" />)
    expect(container.firstElementChild!.className).toContain('items-start')
    expect(container.firstElementChild!.className).not.toContain('items-center')
  })

  it('align=center centers the label, figure and trend (53:39 ALIGN variant)', () => {
    const { container } = render(
      <Stat label="Estimated Payout" value="$57,781.02" align="center" />
    )
    expect(container.firstElementChild!.className).toContain('items-center')
    expect(container.firstElementChild!.className).toContain('text-center')
  })

  it('uses the .stat typography utility, which carries tabular-nums for NumberFlow', () => {
    const { container } = render(<Stat label="Gold spot" value={2411.2} />)
    const figure = container.querySelector('.stat')
    expect(figure).toBeTruthy()
  })

  it('the label is a real <small>, with no tracking utility fighting the ramp (53:39 Small/Regular)', () => {
    const { getByText } = render(<Stat label="Gold spot" value="$2,411.20" />)
    const label = getByText('Gold spot')
    expect(label.tagName.toLowerCase()).toBe('small')
    expect(label.className).not.toMatch(/tracking-/)
  })
})
