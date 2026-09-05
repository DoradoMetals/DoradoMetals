import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Divider } from './Divider'
import { axeViolations } from '../test/axe'

describe('Divider', () => {
  it('renders a horizontal hairline by default, and axe finds nothing', async () => {
    const { container } = render(<Divider />)
    const rule = container.firstElementChild as HTMLElement
    expect(rule.className).toMatch(/h-px/)
    expect(rule.className).toMatch(/w-full/)
    expect(rule.className).toMatch(/bg-border/)
    expect(await axeViolations(container)).toEqual([])
  })

  it('is decorative by default, so it carries role=none rather than separator', () => {
    const { container } = render(<Divider />)
    expect(container.firstElementChild!.getAttribute('role')).toBe('none')
  })

  it('decorative=false exposes it to assistive tech as a separator', () => {
    const { container } = render(<Divider decorative={false} />)
    expect(container.firstElementChild!.getAttribute('role')).toBe('separator')
  })

  it('vertical orientation is a min-h-full 1px column', () => {
    const { container } = render(<Divider orientation="vertical" />)
    const rule = container.firstElementChild as HTMLElement
    expect(rule.className).toMatch(/min-h-full/)
    expect(rule.className).toMatch(/w-px/)
  })

  it('vertical, non-decorative sets aria-orientation', () => {
    const { container } = render(<Divider orientation="vertical" decorative={false} />)
    expect(container.firstElementChild!.getAttribute('aria-orientation')).toBe('vertical')
  })

  it("a label renders the 'or continue with' pattern: rule, text, rule", () => {
    const { container, getByText } = render(<Divider label="or" />)
    expect(getByText('or')).toBeTruthy()
    const rules = container.querySelectorAll('[aria-hidden="true"]')
    expect(rules.length).toBe(2)
  })

  it('label is exposed as a per-instance node, not fixed text', () => {
    const { getByText } = render(<Divider label={<span>or continue with</span>} />)
    expect(getByText('or continue with')).toBeTruthy()
  })

  it('a label is ignored on a vertical divider, which stays a bare rule', () => {
    const { container, queryByText } = render(<Divider orientation="vertical" label="or" />)
    expect(queryByText('or')).toBe(null)
    expect(container.firstElementChild!.className).toMatch(/min-h-full/)
  })
})
