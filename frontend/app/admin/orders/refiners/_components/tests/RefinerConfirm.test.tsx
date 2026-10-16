import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { RefinerConfirm, type RefinerConfirmProps } from '../RefinerConfirm'

const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement
const button = (label: string) =>
  [...dialog().querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement

function open(extra: Partial<RefinerConfirmProps> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <RefinerConfirm
      open
      action={{ name: 'settle', confirm: null, override: null }}
      reference="RS-2493"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extra}
    />
  )
  return { onConfirm, onCancel }
}

describe('RefinerConfirm (1204:25108)', () => {
  it('Confirm, Neutral, Desktop (1204:24928): title, body, Cancel then a primary confirm in a row', () => {
    const { onConfirm } = open()
    expect(dialog().getAttribute('data-kind')).toBe('confirm')
    expect(dialog().getAttribute('data-intent')).toBe('neutral')
    expect(dialog().className).toContain('max-w-[26.25rem]')
    expect(dialog().textContent).toContain('Settle RS-2493?')
    expect(dialog().textContent).toContain('Every lot is marked settled at the refiner’s figures.')
    const labels = [...dialog().querySelectorAll('button')].map((b) => b.textContent)
    expect(labels.slice(0, 2)).toEqual(['Cancel', 'Settle'])
    expect(button('Settle').className).toContain('bg-primary')
    fireEvent.click(button('Settle'))
    expect(onConfirm).toHaveBeenCalledWith({})
  })

  it('puts the API confirm text before the copy', () => {
    open({ action: { name: 'settle', confirm: '2 of 5 lots are not settled', override: null } })
    expect(dialog().textContent).toContain(
      '2 of 5 lots are not settled. Every lot is marked settled'
    )
  })

  it('Confirm, Danger, Desktop (1204:24961): cancel releases the lots, Keep order / Cancel order', () => {
    const { onConfirm, onCancel } = open({
      action: { name: 'cancel', confirm: null, override: null },
    })
    expect(dialog().getAttribute('data-intent')).toBe('danger')
    expect(dialog().textContent).toContain('Cancel RS-2493?')
    expect(dialog().textContent).toContain('Its lots are released and go back on hand.')
    expect(button('Cancel order').className).toContain('bg-destructive')
    fireEvent.click(button('Keep order'))
    expect(onCancel).toHaveBeenCalled()
    fireEvent.click(button('Cancel order'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it.each([
    ['edit_lots', 'Change the lots on RS-2493?', 'Change lots'],
    ['send', 'Send RS-2493?', 'Send'],
    ['send_payment', 'Send payment for RS-2493?', 'Send payment'],
    ['lock_ounces', 'Lock ounces on RS-2493?', 'Lock ounces'],
    ['resolve_dispute', 'Resolve the dispute on RS-2493?', 'Resolve dispute'],
  ] as const)('%s reads its own title and confirm label', (name, title, label) => {
    open({ action: { name, confirm: 'Refiner order 2493 has already been sent', override: null } })
    expect(dialog().textContent).toContain(title)
    expect(dialog().textContent).toContain('Refiner order 2493 has already been sent.')
    expect(button(label)).toBeTruthy()
  })

  it('an override asks for a reason and sends it', () => {
    const { onConfirm } = open({
      action: {
        name: 'send_payment',
        confirm: null,
        override: 'This refiner order already has a Sent payout',
      },
    })
    expect(dialog().textContent).toContain('This refiner order already has a Sent payout.')
    expect(button('Send payment').disabled).toBe(true)
    fireEvent.change(dialog().querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: ' second wire agreed with the refiner ' },
    })
    expect(button('Send payment').disabled).toBe(false)
    fireEvent.click(button('Send payment'))
    expect(onConfirm).toHaveBeenCalledWith({
      override_reason: 'second wire agreed with the refiner',
    })
  })

  it('Confirm, Mobile (1204:25023 / 1204:25048): small dialog, stacked full-width footer', () => {
    open({ layout: 'mobile', action: { name: 'cancel', confirm: null, override: null } })
    expect(dialog().getAttribute('data-layout')).toBe('mobile')
    expect(dialog().className).toContain('max-w-none')
    const footer = dialog().querySelector('.flex-col-reverse') as HTMLElement
    expect(footer.className).toContain('[&>button]:w-full')
  })

  it.each(['desktop', 'mobile'] as const)(
    'Step-up (%s) (1204:24980 / 1204:25067): code entry, passkey link, Verify',
    (layout) => {
      const onVerify = vi.fn()
      const onPasskey = vi.fn()
      open({
        layout,
        action: { name: 'send_payment', confirm: null, override: 'already Sent' },
        stepUp: { destination: '(•••) •••-0142', onVerify, onPasskey },
      })
      expect(dialog().getAttribute('data-kind')).toBe('step-up')
      expect(dialog().textContent).toContain('Confirm it’s you')
      expect(dialog().textContent).toContain('This action needs a fresh sign-in.')
      expect(dialog().textContent).toContain('Enter the 6-digit code we sent to (•••) •••-0142.')
      expect(button('Verify').disabled).toBe(true)
      const link = [...dialog().querySelectorAll('a')].find(
        (a) => a.textContent === 'Use a passkey instead'
      ) as HTMLElement
      fireEvent.click(link)
      expect(onPasskey).toHaveBeenCalled()
    }
  )

  it('pending disables the confirm', () => {
    open({ pending: true })
    expect(button('Settle').disabled).toBe(true)
  })

  it('renders nothing when closed', () => {
    render(
      <RefinerConfirm
        open={false}
        action={{ name: 'settle', confirm: null, override: null }}
        reference="RS-2493"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(dialog()).toBeNull()
  })
})
