import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'

import { FeedNotice } from '../../_components'
import { spotBadge } from '../_lib'

describe('spot state', () => {
  test('stale and frozen outrank the direction', () => {
    expect(spotBadge({ state: 'stale', direction: 'up' })).toEqual({
      label: 'Stale',
      intent: 'warning',
    })
    expect(spotBadge({ state: 'frozen', direction: 'down' })?.label).toBe('Frozen')
    expect(spotBadge({ state: 'live', direction: 'up' })?.label).toBe('Up')
    expect(spotBadge({ state: 'live', direction: 'flat' })).toBeNull()
  })

  test('the stale notice carries its actions', () => {
    render(
      <FeedNotice
        intent="danger"
        mobile={false}
        title="Spot feed stale"
        message="Orders still price from the last good tick."
        actions={<button type="button">Retry now</button>}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('Spot feed stale')
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
  })
})
