import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import * as React from 'react'

import { OTPInput, type OTPInputProps } from './OTPInput'
import { setup, useUserFakeTimers } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness(props: Partial<OTPInputProps>) {
  const [value, setValue] = React.useState('')
  return <OTPInput value={value} onValueChange={setValue} length={4} {...props} />
}

describe('OTPInput behaviour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['default', {}],
    ['titled and described', { title: 'Check your phone', description: 'We sent a code' }],
    ['invalid', { invalid: true }],
    ['disabled', { disabled: true }],
    ['resend countdown', { resendIn: 30 }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(<Harness {...props} />)
    expect(container.querySelector('input')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('takes digits only, stops at the length and completes once', async () => {
    const onComplete = vi.fn()
    const { user, getByRole, getAllByTestId } = setup(<Harness onComplete={onComplete} />)
    const box = getByRole('textbox', { name: 'One-time code' }) as HTMLInputElement
    expect(document.activeElement).toBe(box)
    await user.keyboard('1a2b34567')
    expect(box.value).toBe('1234')
    expect(getAllByTestId('otp-cell').map((cell) => cell.textContent)).toEqual(['1', '2', '3', '4'])
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('1234')
    await user.keyboard('{Backspace}')
    expect(box.value).toBe('123')
  })

  it('paste fills the code, keeping digits only', async () => {
    const onComplete = vi.fn()
    const { user, getByRole } = setup(<Harness onComplete={onComplete} autoFocus={false} />)
    const box = getByRole('textbox') as HTMLInputElement
    await user.click(box)
    await user.paste('12-34')
    expect(box.value).toBe('1234')
    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('a paste with no digits leaves the code empty', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <OTPInput value="" onValueChange={onValueChange} autoFocus={false} />
    )
    await user.click(getByRole('textbox'))
    await user.paste('abc')
    expect(onValueChange.mock.calls.every(([next]) => next === '')).toBe(true)
  })

  it('a disabled field ignores a paste', () => {
    const onValueChange = vi.fn()
    const { container } = setup(<OTPInput value="" onValueChange={onValueChange} disabled />)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.assign(event, { clipboardData: { getData: () => '1234' } })
    container.querySelector('input')!.dispatchEvent(event)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('shows the caret on the active cell only while focused', async () => {
    const { user, queryByTestId } = setup(<Harness autoFocus={false} />)
    expect(queryByTestId('otp-caret')).toBeNull()
    await user.tab()
    expect(queryByTestId('otp-caret')).toBeTruthy()
    await user.tab()
    expect(queryByTestId('otp-caret')).toBeNull()
  })

  it('disabled does not take focus on mount', () => {
    const { getByRole } = setup(<Harness disabled />)
    expect(document.activeElement).not.toBe(getByRole('textbox'))
  })

  it('counts the resend down each second, then offers Resend', async () => {
    useUserFakeTimers()
    const onResend = vi.fn()
    const { user, getByText, getByRole } = setup(<Harness resendIn={2} onResend={onResend} />, {
      fakeTimers: true,
    })
    expect(getByText('Resend in 2s')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByText('Resend in 1s')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await user.click(getByRole('button', { name: 'Resend code' }))
    expect(onResend).toHaveBeenCalledTimes(1)
  })

  it('a zero countdown offers Resend at once; unmounting mid-countdown leaves no timer', () => {
    useUserFakeTimers()
    const { getByRole, unmount } = setup(<Harness resendIn={0} />)
    expect(getByRole('button', { name: 'Resend code' })).toBeTruthy()
    unmount()
    const cleared = vi.spyOn(globalThis, 'clearInterval')
    const ticking = setup(<Harness resendIn={10} />)
    ticking.unmount()
    expect(cleared).toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
  })
})
