import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { Textarea, type TextareaProps } from './Textarea'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

describe('Textarea', () => {
  it.each([
    ['default', {}],
    ['message', { message: 'Optional' }],
    ['invalid', { invalid: true, message: 'Too long' }],
    ['success', { success: true, message: 'Saved' }],
    ['disabled', { disabled: true }],
    ['count with max', { showCount: true, maxLength: 10 }],
  ])('%s renders and axe finds nothing', async (_name, props: Partial<TextareaProps>) => {
    const { container, getByLabelText } = setup(<Textarea label="Notes" {...props} />)
    expect(getByLabelText('Notes')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default area keeps its class list', () => {
    const { getByRole } = setup(<Textarea label="Notes" />)
    expect(classList(getByRole('textbox'))).toMatchInlineSnapshot(`
      [
        "bg-card",
        "border",
        "border-border",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
        "disabled:pointer-events-none",
        "disabled:text-foreground-disabled",
        "flex-1",
        "focus-visible:border-primary",
        "min-h-24",
        "outline-none",
        "placeholder:text-placeholder",
        "px-sm",
        "py-xs",
        "resize-y",
        "rounded-lg",
        "text-field",
        "text-foreground",
        "transition-colors",
        "w-full",
      ]
    `)
  })

  it('uncontrolled: typing updates the count and clearing resets it', async () => {
    const onChange = vi.fn()
    const { user, getByRole, getByText } = setup(
      <Textarea label="Notes" showCount maxLength={20} defaultValue="ab" onChange={onChange} />
    )
    expect(getByText('2 / 20')).toBeTruthy()
    await user.type(getByRole('textbox'), 'cd')
    expect(getByText('4 / 20')).toBeTruthy()
    expect(onChange).toHaveBeenCalledTimes(2)
    await user.clear(getByRole('textbox'))
    expect(getByText('0 / 20')).toBeTruthy()
  })

  it('controlled: the value prop wins and the count follows the prop', async () => {
    const onChange = vi.fn()
    const { user, getByRole, getByText, rerender } = setup(
      <Textarea label="Notes" showCount value="abc" onChange={onChange} />
    )
    await user.type(getByRole('textbox'), 'x')
    expect(onChange).toHaveBeenCalled()
    expect((getByRole('textbox') as HTMLTextAreaElement).value).toBe('abc')
    expect(getByText('3')).toBeTruthy()
    rerender(<Textarea label="Notes" showCount value="abcdef" onChange={onChange} />)
    expect(getByText('6')).toBeTruthy()
  })

  it('a value over the max reads destructive; describedby joins message, count and the caller', () => {
    const { getByRole, getByText } = setup(
      <Textarea
        id="n"
        label="Notes"
        message="Hint"
        showCount
        maxLength={3}
        value="abcdef"
        onChange={() => {}}
        aria-describedby="extra"
      />
    )
    expect(getByText('6 / 3').className).toContain('text-destructive')
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBe('n-message n-count extra')
  })

  it('controlled through state accepts multi-line input', async () => {
    function Harness() {
      const [value, setValue] = React.useState('')
      return <Textarea label="Notes" value={value} onChange={(e) => setValue(e.target.value)} />
    }
    const { user, getByRole } = setup(<Harness />)
    await user.type(getByRole('textbox'), 'one{Enter}two')
    expect((getByRole('textbox') as HTMLTextAreaElement).value).toBe('one\ntwo')
  })
})
