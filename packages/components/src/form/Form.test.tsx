import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { useForm } from 'react-hook-form'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './Form'
import { ValidatedField } from './ValidatedField'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

type Values = { weight: string }

function WeightForm({
  onValid,
  hint,
}: {
  onValid: (values: Values) => void
  hint?: React.ReactNode
}) {
  const form = useForm<Values>({ defaultValues: { weight: '' } })
  return (
    <Form {...form}>
      <form aria-label="Lot" onSubmit={form.handleSubmit(onValid)}>
        <FormField
          control={form.control}
          name="weight"
          rules={{
            required: 'Enter a weight',
            validate: (v) => Number(v) > 0 || 'Weight must be above zero',
          }}
          render={({ field }) => (
            <FormItem className="extra-item">
              <FormLabel>Weight</FormLabel>
              <FormControl>
                <input {...field} />
              </FormControl>
              <FormDescription>Grams, before melt</FormDescription>
              <FormMessage>{hint}</FormMessage>
            </FormItem>
          )}
        />
        <button type="submit">Save</button>
      </form>
    </Form>
  )
}

describe('Form composition', () => {
  it('labels the control, describes it, and axe finds nothing', async () => {
    const { container, getByRole } = setup(<WeightForm onValid={() => {}} />)
    const box = getByRole('textbox', { name: 'Weight' })
    expect(box.getAttribute('aria-invalid')).toBe('false')
    expect(document.getElementById(box.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Grams, before melt'
    )
    expect(container.querySelector('[data-slot="form-item"]')!.className).toBe('extra-item')
    await expectNoAxeViolations(container)
  })

  it('a failed submit shows the rule message, marks the control invalid and describes it', async () => {
    const onValid = vi.fn()
    const { user, getByRole, getByText } = setup(<WeightForm onValid={onValid} />)
    await user.click(getByRole('button', { name: 'Save' }))
    expect(onValid).not.toHaveBeenCalled()
    const box = getByRole('textbox', { name: 'Weight' })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(getByText('Enter a weight').id).toBe(box.getAttribute('aria-describedby')!.split(' ')[1])
    expect(getByText('Weight').getAttribute('data-error')).toBe('true')
    await user.type(box, '-1')
    await user.click(getByRole('button', { name: 'Save' }))
    expect(getByText('Weight must be above zero')).toBeTruthy()
  })

  it('a valid submit passes the values and clears the error', async () => {
    const onValid = vi.fn()
    const { user, getByRole, queryByText } = setup(<WeightForm onValid={onValid} />)
    await user.click(getByRole('button', { name: 'Save' }))
    await user.type(getByRole('textbox'), '12.5{Enter}')
    expect(onValid).toHaveBeenCalledWith({ weight: '12.5' }, expect.anything())
    expect(queryByText('Enter a weight')).toBeNull()
  })

  it('the message slot shows its children with no error and nothing when empty', () => {
    const { getByText, unmount, container } = setup(
      <WeightForm onValid={() => {}} hint="Optional note" />
    )
    expect(getByText('Optional note').getAttribute('data-slot')).toBe('form-message')
    unmount()
    const bare = setup(<WeightForm onValid={() => {}} />)
    expect(bare.container.querySelector('[data-slot="form-message"]')).toBeNull()
    expect(container.innerHTML).toBe('')
  })
})

describe('ValidatedField extras', () => {
  function Harness({
    onInputChange,
    showFormError,
  }: {
    onInputChange?: () => void
    showFormError?: boolean
  }) {
    const form = useForm<{ email: string }>({ defaultValues: { email: '' }, mode: 'onTouched' })
    return (
      <ValidatedField
        control={form.control}
        name="email"
        label="Email"
        showFormError={showFormError}
        inputProps={{ onChange: onInputChange, trailing: 'req', placeholder: 'you@example.test' }}
      />
    )
  }

  it("composes the caller's onChange with the form's and passes trailing through", async () => {
    const onInputChange = vi.fn()
    const { user, getByRole, getByText } = setup(<Harness onInputChange={onInputChange} />)
    await user.type(getByRole('textbox', { name: 'Email' }), 'a@b.co')
    expect(onInputChange).toHaveBeenCalledTimes(6)
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('a@b.co')
    expect(getByText('req')).toBeTruthy()
  })

  it('a touched valid field reads success', async () => {
    const { user, getByRole, container } = setup(<Harness showFormError={false} />)
    await user.type(getByRole('textbox'), 'a@b.co')
    await user.tab()
    expect(container.querySelector('.border-success')).toBeTruthy()
  })
})
