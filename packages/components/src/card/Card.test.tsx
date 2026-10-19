import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Card, CardSlot } from './Card'
import { expectNoAxeViolations } from '../test/axe'

describe('Card', () => {
  it('wears the chassis tokens and renders its children', async () => {
    const { getByText, container } = render(<Card className="extra">hello</Card>)
    const card = getByText('hello')
    expect(card.className).toContain('bg-card')
    expect(card.className).toContain('border-border')
    expect(card.className).toContain('p-sm')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('extra')
    await expectNoAxeViolations(container)
  })

  it('CardSlot defaults to the word Content and takes a replacement', () => {
    const { getByText, rerender } = render(<CardSlot />)
    expect(getByText('Content').className).toContain('bg-muted')
    rerender(<CardSlot>mine</CardSlot>)
    expect(getByText('mine')).toBeTruthy()
  })
})
