import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Switch } from './Switch'
import { axeViolations } from '../test/axe'

describe('Switch', () => {
  it('is a real switch that toggles, and axe finds nothing', async () => {
    const onCheckedChange = vi.fn()
    const { getByRole, container } = render(
      <Switch aria-label="Email notifications" onCheckedChange={onCheckedChange} />
    )
    const sw = getByRole('switch', { name: 'Email notifications' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(await axeViolations(container)).toEqual([])
  })

  it('unchecked hover escalates to border-strong and accent, same as checkbox/radio (17:14, 2026-10-10)', () => {
    const { getByRole } = render(<Switch aria-label="x" />)
    const sw = getByRole('switch')
    expect(sw.className).toContain('data-[state=unchecked]:hover:border-border-strong')
    expect(sw.className).toContain('data-[state=unchecked]:hover:bg-accent')
  })

  it('disabled unchecked thumb is border-strong, not muted-foreground (17:14, 2026-10-10)', () => {
    const { getByRole } = render(<Switch aria-label="x" disabled />)
    const thumb = getByRole('switch').querySelector('span') as HTMLElement
    expect(thumb.className).toContain('group-disabled:data-[state=unchecked]:bg-border-strong')
  })
})
