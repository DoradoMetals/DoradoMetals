import { describe, expect, it } from 'vitest'
import * as React from 'react'

import { MaskedField, type MaskKind } from './MaskedField'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ mask, initial = '' }: { mask: MaskKind; initial?: string }) {
  const [raw, setRaw] = React.useState(initial)
  return (
    <>
      <MaskedField label="Field" mask={mask} value={raw} onValueChange={setRaw} />
      <output aria-label="Raw">{raw}</output>
    </>
  )
}

const cases: [MaskKind, string, string, string][] = [
  ['phone', '5551234567', '(555) 123-4567', '5551234567'],
  ['phone', '55512', '(555) 12', '55512'],
  ['phone', '55', '55', '55'],
  ['card', '4242424242424242', '4242 4242 4242 4242', '4242424242424242'],
  ['expiry', '1227', '12 / 27', '1227'],
  ['expiry', '1', '1', '1'],
  ['amount', '1234567.891', '1,234,567.89', '1234567.89'],
  ['amount', '0', '0', '0'],
  ['amount', '1000', '1,000', '1000'],
  ['email', 'ana@example.test', 'ana@example.test', 'ana@example.test'],
]

describe('MaskedField', () => {
  it.each(cases)('%s: typing %s shows %s and reports %s', async (mask, typed, shown, raw) => {
    const { user, getByRole, getByLabelText } = setup(<Harness mask={mask} />)
    const box = getByLabelText('Field') as HTMLInputElement
    await user.type(box, typed)
    expect(box.value).toBe(shown)
    expect(getByRole('status', { name: 'Raw' }).textContent).toBe(raw)
  })

  it.each(['phone', 'card', 'expiry', 'amount', 'email'] as const)(
    '%s renders with its keyboard hint and axe finds nothing',
    async (mask) => {
      const { container, getByLabelText } = setup(<Harness mask={mask} />)
      expect(getByLabelText('Field').getAttribute('inputmode')).toBeTruthy()
      await expectNoAxeViolations(container)
    }
  )

  it('clearing empties the raw value', async () => {
    const { user, getByLabelText, getByRole } = setup(<Harness mask="phone" initial="5551234567" />)
    expect((getByLabelText('Field') as HTMLInputElement).value).toBe('(555) 123-4567')
    await user.clear(getByLabelText('Field'))
    expect(getByRole('status', { name: 'Raw' }).textContent).toBe('')
  })
})
