import { describe, expect, it, vi } from 'vitest'

import { Switch } from './Switch'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

describe('Switch', () => {
  it.each([
    ['unchecked', {}],
    ['checked', { defaultChecked: true }],
    ['disabled', { disabled: true }],
    ['disabled checked', { disabled: true, defaultChecked: true }],
  ])('%s with a label renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(<Switch label="Email receipts" {...props} />)
    expect(getByRole('switch', { name: 'Email receipts' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default control keeps its class list', () => {
    const { getByRole } = setup(<Switch aria-label="Receipts" />)
    expect(classList(getByRole('switch'))).toMatchInlineSnapshot(`
      [
        "border",
        "border-transparent",
        "cursor-pointer",
        "data-[state=checked]:bg-primary",
        "data-[state=checked]:hover:opacity-85",
        "data-[state=unchecked]:bg-muted",
        "data-[state=unchecked]:border-border",
        "data-[state=unchecked]:hover:bg-accent",
        "data-[state=unchecked]:hover:border-border-strong",
        "disabled:cursor-not-allowed",
        "disabled:data-[state=checked]:bg-border-strong",
        "disabled:opacity-50",
        "focus-ring",
        "group",
        "h-5",
        "hit-area",
        "inline-flex",
        "items-center",
        "peer",
        "relative",
        "rounded-full",
        "shrink-0",
        "transition-colors",
        "w-9",
      ]
    `)
  })

  it('uncontrolled: click, Space and the label toggle it', async () => {
    const { user, getByRole, getByText } = setup(<Switch label="Receipts" />)
    const control = getByRole('switch')
    await user.click(control)
    expect(control.getAttribute('aria-checked')).toBe('true')
    await user.keyboard(' ')
    expect(control.getAttribute('aria-checked')).toBe('false')
    await user.click(getByText('Receipts'))
    expect(control.getAttribute('aria-checked')).toBe('true')
  })

  it('controlled: checked wins and onCheckedChange reports', async () => {
    const onCheckedChange = vi.fn()
    const { user, getByRole } = setup(
      <Switch aria-label="Receipts" checked={false} onCheckedChange={onCheckedChange} />
    )
    await user.click(getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })

  it('disabled ignores the pointer and keeps an explicit id', async () => {
    const onCheckedChange = vi.fn()
    const { user, getByRole } = setup(
      <Switch id="sw" label="Receipts" disabled onCheckedChange={onCheckedChange} />
    )
    await user.click(getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(getByRole('switch').id).toBe('sw')
  })
})
