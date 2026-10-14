import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { EntityHeader } from './EntityHeader'
import { Badge } from '../badge/Badge'
import { Button } from '../button/Button'
import { Select } from '../select/Select'
import { axeViolations } from '../test/axe'

function full(layout: 'desktop' | 'mobile') {
  return render(
    <EntityHeader
      layout={layout}
      eyebrow="Purchase order"
      badge={<Badge>Open</Badge>}
      title="PO-2189"
      reference="Placed Oct 12"
      meta="Jane Doe · 3 items"
      assignedTo={<Select label="Assigned to" items={[{ value: 'a', label: 'Ana' }]} />}
      buttons={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button>Approve</Button>
        </>
      }
    />
  )
}

describe('EntityHeader', () => {
  it('desktop (849:41) renders the anatomy on a card, and axe finds nothing', async () => {
    const { container, getByRole, getByText } = full('desktop')
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('bg-card')
    expect(root.className).toContain('p-md')
    expect(root.className).toContain('gap-sm')
    expect(getByRole('heading', { name: 'PO-2189' }).className).toContain('text-h2')
    const eyebrow = getByText('Purchase order')
    expect(eyebrow.className).toContain('eyebrow')
    expect(eyebrow.parentElement?.textContent).toContain('Open')
    expect(getByText('Placed Oct 12').className).toContain('text-small')
    expect(getByText('Jane Doe · 3 items').getAttribute('data-emphasis')).toBe('subtle')
    expect(await axeViolations(container)).toEqual([])
  })

  it('desktop puts actions beside the identity with no hairline; buttons fill their row', () => {
    const { container, getByRole } = full('desktop')
    expect(container.querySelector('[role="none"]')).toBeNull()
    const row = getByRole('button', { name: 'Approve' }).parentElement as HTMLElement
    expect(row.className).toContain('gap-sm')
    expect(row.className).toContain('*:flex-1')
    const split = container.querySelector('.justify-between') as HTMLElement
    expect(split.className).toContain('gap-lg')
  })

  it('mobile stacks identity, hairline, actions and pads lg by md', async () => {
    const { container } = full('mobile')
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('py-lg')
    expect(root.className).toContain('px-md')
    expect(root.querySelector(':scope > [role="none"]')).toBeTruthy()
    expect(root.querySelector(':scope > .justify-between')).toBeNull()
    expect(await axeViolations(container)).toEqual([])
  })

  it('every part is optional; slots render in place of their text lines', () => {
    const { queryByRole, getByText, container } = render(
      <EntityHeader
        identity={<div>Identity slot</div>}
        referenceSlot={<div>Ref slot</div>}
        actions={<div>Actions slot</div>}
      />
    )
    expect(queryByRole('heading')).toBeNull()
    expect(getByText('Identity slot')).toBeTruthy()
    expect(getByText('Ref slot')).toBeTruthy()
    expect(getByText('Actions slot')).toBeTruthy()
    expect(container.querySelector('.eyebrow')).toBeNull()
  })
})
