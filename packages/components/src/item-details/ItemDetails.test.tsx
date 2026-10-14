import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { ItemDetails } from './ItemDetails'
import { axeViolations } from '../test/axe'

describe('ItemDetails', () => {
  it('shows only the parts given, with a middot before each but the first', async () => {
    const { container } = render(<ItemDetails name="ELM-88435" weight="12.0 g" purity="33.0%" />)
    expect(container.querySelectorAll('[data-part]')).toHaveLength(3)
    expect(container.textContent).toBe('ELM-88435·' + '12.0 g·' + '33.0%')
    expect(await axeViolations(container)).toEqual([])
  })

  it('starts the line at the first part present', () => {
    const { container } = render(<ItemDetails weight="1 oz" qty="x2" />)
    expect(container.textContent).toBe('1 oz·x2')
  })

  it('muted tone uses the muted text token', () => {
    const { container } = render(<ItemDetails name="A" tone="muted" />)
    expect(container.querySelector('[data-part]')!.className).toContain('text-muted-foreground')
  })

  it('leading drops its own dot and is emphasised', () => {
    const { container } = render(<ItemDetails name="A" spot="$1" leading="spot" />)
    expect(container.textContent).toBe('A$1')
    expect(container.querySelector('[data-leading]')!.className).toContain('font-medium')
  })
})
