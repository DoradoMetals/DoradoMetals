import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { Search } from '@dorado/icons'

import { Input, type InputProps } from './Input'
import { Field } from '../field/Field'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const states: [string, Partial<InputProps>][] = [
  ['default', {}],
  ['placeholder', { placeholder: 'Search lots' }],
  ['filled', { defaultValue: 'PO-12' }],
  ['invalid', { invalid: true, message: 'Required' }],
  ['success', { success: true, message: 'Looks good' }],
  ['disabled', { disabled: true }],
  ['read only', { readOnly: true, defaultValue: 'Locked' }],
  ['leading icon', { leading: <Search aria-hidden /> }],
  ['leading label', { leadingLabel: '$' }],
  ['trailing', { trailing: 'oz' }],
  ['number', { type: 'number' }],
]

describe('Input state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByLabelText } = setup(<Input label="Weight" {...props} />)
    expect(getByLabelText('Weight')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default control keeps its class list', () => {
    const { getByRole } = setup(<Input label="Weight" />)
    expect(classList(getByRole('textbox').parentElement)).toMatchInlineSnapshot(`
      [
        "aria-[invalid=true]:border-destructive",
        "bg-card",
        "border",
        "border-border",
        "data-[disabled]:opacity-50",
        "data-[disabled]:pointer-events-none",
        "data-[disabled]:text-foreground-disabled",
        "data-[invalid]:border-destructive",
        "data-[readonly]:cursor-default",
        "disabled:opacity-50",
        "disabled:pointer-events-none",
        "disabled:text-foreground-disabled",
        "flex",
        "focus-visible:border-primary",
        "focus-visible:outline-none",
        "focus-within:border-primary",
        "gap-xs",
        "items-center",
        "min-h-(--control-lg)",
        "px-sm",
        "rounded-lg",
        "text-field",
        "text-foreground",
        "transition-colors",
        "w-full",
      ]
    `)
  })
})

describe('Input behaviour', () => {
  it('uncontrolled: types and clears', async () => {
    const onChange = vi.fn()
    const { user, getByRole } = setup(<Input label="Note" onChange={onChange} />)
    const box = getByRole('textbox', { name: 'Note' }) as HTMLInputElement
    await user.type(box, 'Rings')
    expect(box.value).toBe('Rings')
    expect(onChange).toHaveBeenCalledTimes(5)
    await user.clear(box)
    expect(box.value).toBe('')
  })

  it('controlled: the value prop wins and onChange fires per key', async () => {
    const onChange = vi.fn()
    const { user, getByRole } = setup(<Input label="Note" value="Fixed" onChange={onChange} />)
    const box = getByRole('textbox') as HTMLInputElement
    await user.type(box, 'x')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(box.value).toBe('Fixed')
  })

  it('controlled through state follows typing', async () => {
    function Harness() {
      const [value, setValue] = React.useState('')
      return (
        <Input
          label="Note"
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
        />
      )
    }
    const { user, getByRole } = setup(<Harness />)
    await user.type(getByRole('textbox'), 'au')
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('AU')
  })

  it('disabled and read only refuse typing', async () => {
    const { user, getByLabelText } = setup(
      <>
        <Input label="Off" disabled defaultValue="a" />
        <Input label="Locked" readOnly defaultValue="b" />
      </>
    )
    await user.type(getByLabelText('Off'), 'x')
    await user.type(getByLabelText('Locked'), 'x')
    expect((getByLabelText('Off') as HTMLInputElement).value).toBe('a')
    expect((getByLabelText('Locked') as HTMLInputElement).value).toBe('b')
  })

  it('a number field takes zero and negative values and asks for the decimal keypad', async () => {
    const { user, getByLabelText } = setup(<Input label="Grams" type="number" />)
    const box = getByLabelText('Grams') as HTMLInputElement
    expect(box.getAttribute('inputmode')).toBe('decimal')
    await user.type(box, '-0.5')
    expect(box.value).toBe('-0.5')
    await user.clear(box)
    await user.type(box, '0')
    expect(box.value).toBe('0')
  })

  it('the message joins a given describedby; an explicit id is kept', () => {
    const { getByRole } = setup(
      <Input id="w" label="Weight" message="Grams" aria-describedby="extra" />
    )
    expect(getByRole('textbox').id).toBe('w')
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBe('w-message extra')
  })

  it('Tab moves label-less inputs in document order', async () => {
    const { user, getByPlaceholderText } = setup(
      <>
        <Input placeholder="First" aria-label="First" />
        <Input placeholder="Second" aria-label="Second" />
      </>
    )
    await user.tab()
    expect(document.activeElement).toBe(getByPlaceholderText('First'))
    await user.tab()
    expect(document.activeElement).toBe(getByPlaceholderText('Second'))
  })
})

describe('Field', () => {
  it.each([
    ['plain', {}],
    ['message', { message: 'Hint' }],
    ['invalid', { invalid: true, message: 'Wrong' }],
  ])('%s wraps its control and axe finds nothing', async (_name, props) => {
    const { container, getByLabelText } = setup(
      <Field label="Notes" htmlFor="notes" {...props}>
        <textarea id="notes" aria-describedby="outer" />
      </Field>
    )
    expect(getByLabelText('Notes')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('wires the message and invalid state into the child and keeps its own describedby', () => {
    const { getByRole } = setup(
      <Field label="Notes" htmlFor="notes" message="Wrong" invalid>
        <textarea id="notes" aria-describedby="outer" />
      </Field>
    )
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBe('outer notes-message')
    expect(getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  })

  it('without htmlFor or message it adds nothing; a non-element child passes through', () => {
    const { getByRole, getByText, rerender } = setup(
      <Field label="Notes">
        <textarea aria-label="Notes box" />
      </Field>
    )
    expect(getByRole('textbox').getAttribute('aria-describedby')).toBeNull()
    expect(getByRole('textbox').getAttribute('aria-invalid')).toBeNull()
    rerender(<Field label="Notes">plain text</Field>)
    expect(getByText('plain text')).toBeTruthy()
  })
})
