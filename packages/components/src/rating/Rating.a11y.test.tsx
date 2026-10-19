import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Rating, RatingButton } from './Rating'
import { expectNoAxeViolations } from '../test/axe'

function renderRating(props: Partial<React.ComponentProps<typeof Rating>> = {}) {
  return render(
    <Rating {...props}>
      {Array.from({ length: 5 }).map((_, i) => (
        <RatingButton key={i} />
      ))}
    </Rating>
  )
}

describe('Rating accessibility', () => {
  it('stars are radios that report which one is checked', async () => {
    const { getAllByRole, container } = renderRating({ defaultValue: 3 })
    const stars = getAllByRole('radio')
    expect(stars).toHaveLength(5)
    expect(stars.map((s) => s.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ])
    await expectNoAxeViolations(container)
  })

  it('with no rating yet the first star is still reachable by Tab', () => {
    const { getAllByRole } = renderRating()
    expect(getAllByRole('radio').map((s) => s.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ])
  })

  it('Home and End jump to one star and five stars', () => {
    const { getAllByRole } = renderRating({ defaultValue: 2 })
    const stars = getAllByRole('radio')
    stars[1]!.focus()
    fireEvent.keyDown(stars[1]!, { key: 'End' })
    expect(stars[4]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    expect(stars[4]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect(stars[0]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    expect(stars[0]!.getAttribute('aria-checked')).toBe('true')
  })
})
