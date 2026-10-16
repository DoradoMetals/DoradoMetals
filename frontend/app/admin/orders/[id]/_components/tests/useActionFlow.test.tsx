import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import type { Action } from '@dorado/contracts'

import { useActionFlow, type StepUpGate } from '../useActionFlow'
import { button, dialog } from './cardFixtures'

function Harness({
  action,
  onRun,
  stepUp,
}: {
  action: Action
  onRun: (run: { action: Action; reason: string | null }) => void
  stepUp?: StepUpGate
}) {
  const flow = useActionFlow({
    copy: (a) => ({ title: `Run ${a.name}?`, confirmLabel: 'Go' }),
    onRun,
    stepUp,
  })
  return (
    <>
      <button onClick={() => flow.request(action)}>start</button>
      {flow.dialogs}
    </>
  )
}

const start = () => fireEvent.click(screen.getByText('start'))

describe('useActionFlow', () => {
  it('a plain action runs at once', () => {
    const onRun = vi.fn()
    const action = { name: 'lock_spots', confirm: null, override: null }
    render(<Harness action={action} onRun={onRun} />)
    start()
    expect(dialog()).toBeNull()
    expect(onRun).toHaveBeenCalledWith({ action, reason: null })
  })

  it('a confirm action shows the server text and runs on Go', () => {
    const onRun = vi.fn()
    const action = { name: 'finalize', confirm: '2 of 5 lots are not confirmed', override: null }
    render(<Harness action={action} onRun={onRun} />)
    start()
    expect(screen.getByText('Run finalize?')).toBeTruthy()
    expect(screen.getByText('2 of 5 lots are not confirmed')).toBeTruthy()
    fireEvent.click(button(dialog()!, 'Go')!)
    expect(onRun).toHaveBeenCalledWith({ action, reason: null })
  })

  it('an override asks for a reason, then the step-up, then runs with the reason', async () => {
    const onRun = vi.fn()
    const onVerify = vi.fn(() => Promise.resolve())
    const action = { name: 'add_funds', confirm: null, override: 'Already credited' }
    render(
      <Harness
        action={action}
        onRun={onRun}
        stepUp={{ needed: true, destination: '•••-0142', onVerify }}
      />
    )
    start()
    expect(screen.getByText('Already credited')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer asked twice' } })
    fireEvent.click(button(dialog()!, 'Go')!)
    expect(screen.getByText('Confirm it’s you')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } })
    await act(async () => {
      fireEvent.click(button(dialog()!, 'Verify')!)
    })
    expect(onVerify).toHaveBeenCalledWith('123456')
    await waitFor(() =>
      expect(onRun).toHaveBeenCalledWith({ action, reason: 'Customer asked twice' })
    )
  })

  it('an override with a fresh step-up runs straight after the reason', () => {
    const onRun = vi.fn()
    const action = { name: 'add_funds', confirm: null, override: 'Already credited' }
    render(
      <Harness
        action={action}
        onRun={onRun}
        stepUp={{ needed: false, destination: '', onVerify: () => {} }}
      />
    )
    start()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer asked twice' } })
    fireEvent.click(button(dialog()!, 'Go')!)
    expect(onRun).toHaveBeenCalledWith({ action, reason: 'Customer asked twice' })
  })

  it('cancel closes without running', () => {
    const onRun = vi.fn()
    const action = { name: 'finalize', confirm: 'Sure?', override: null }
    render(<Harness action={action} onRun={onRun} />)
    start()
    fireEvent.click(button(dialog()!, 'Cancel')!)
    expect(onRun).not.toHaveBeenCalled()
  })
})
