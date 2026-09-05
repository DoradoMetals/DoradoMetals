import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { List, ListItem } from './List'
import { axeViolations } from '../test/axe'

describe('List', () => {
  it('is a real list of items, and axe finds nothing', async () => {
    const { container, getAllByRole } = render(
      <List>
        <ListItem>Insured shipping</ListItem>
        <ListItem>Same-day payout</ListItem>
      </List>
    )
    expect(container.querySelector('ul')).toBeTruthy()
    expect(getAllByRole('listitem').length).toBe(2)
    expect(await axeViolations(container)).toEqual([])
  })

  it('markers are decoration, hidden from the tree', () => {
    const { container } = render(
      <List>
        <ListItem>x</ListItem>
      </List>
    )
    expect(container.querySelector('[aria-hidden]')).toBeTruthy()
  })

  it('the number marker is body weight and size, like the drawing (97:17: Regular row type, not Small/Medium)', () => {
    const { container } = render(
      <List marker="number">
        <ListItem>Insured shipping</ListItem>
      </List>
    )
    const numberMarker = container.querySelector('[aria-hidden] > span')
    expect(numberMarker).toBeTruthy()
    expect(numberMarker?.className).not.toMatch(/text-small/)
    expect(numberMarker?.className).not.toMatch(/font-medium/)
    expect(numberMarker?.className).toMatch(/text-muted-foreground/)
    expect(container.querySelector('ol')).toBeTruthy()
  })
})
