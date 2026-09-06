import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { CallEvent } from './CallEvent'
import { Chat, type ChatCall, type ChatMessage } from './Chat'
import { Message } from './Message'
import { axeViolations } from '../test/axe'

const messages: ChatMessage[] = [
  { id: '1', direction: 'outbound', status: 'delivered', time: '2:14 PM', body: 'Order received.' },
  { id: '2', direction: 'inbound', time: '2:16 PM', body: 'Thanks! When do I get paid?' },
]

const calls: ChatCall[] = [
  { id: '1', kind: 'outgoing', detail: '3m 40s', time: '2:15 PM' },
  { id: '2', kind: 'missed', time: 'Sep 2, 4:08 PM' },
]

describe('Message', () => {
  it('inbound sits left on muted and carries no status: it arrived, that is the whole story', () => {
    const { container, queryByText } = render(
      <Message direction="inbound" time="2:16 PM">
        Hello
      </Message>
    )
    expect(container.firstElementChild?.className).toContain('items-start')
    expect(container.querySelector('.bg-muted')).toBeTruthy()
    expect(queryByText(/Delivered/)).toBeNull()
  })

  it('outbound sits right on primary and shows the delivery status', () => {
    const { container, getByText } = render(
      <Message direction="outbound" status="delivered" time="2:14 PM">
        Hello
      </Message>
    )
    expect(container.firstElementChild?.className).toContain('items-end')
    expect(container.querySelector('.bg-primary')).toBeTruthy()
    expect(getByText('· Delivered')).toBeTruthy()
  })

  it('failed reads as a retry affordance in destructive, not as a quiet note', () => {
    const { getByText } = render(
      <Message direction="outbound" status="failed" time="2:14 PM">
        Hello
      </Message>
    )
    const status = getByText('· Not delivered, tap to retry')
    expect(status.className).toContain('text-destructive')
  })

  it('the bubble wraps at 296px so a long text is never one line across the card', () => {
    const { container } = render(
      <Message direction="inbound" time="2:16 PM">
        Hello
      </Message>
    )
    expect(container.querySelector('.max-w-\\[296px\\]')).toBeTruthy()
  })
})

describe('CallEvent', () => {
  it('outgoing shows the duration and the time', () => {
    const { getByText } = render(<CallEvent kind="outgoing" detail="4m 12s" time="1:52 PM" />)
    expect(getByText('Outgoing call')).toBeTruthy()
    expect(getByText('4m 12s')).toBeTruthy()
    expect(getByText('1:52 PM')).toBeTruthy()
  })

  it("no answer is an outgoing call whose detail is static text, not a duration", () => {
    const { getByText, queryByText } = render(
      <CallEvent kind="no-answer" detail="4m 12s" time="11:30 AM" />
    )
    expect(getByText('Outgoing call')).toBeTruthy()
    expect(getByText('No answer')).toBeTruthy()
    expect(queryByText('4m 12s')).toBeNull()
  })

  it('missed hides the detail and goes destructive - it is a customer we owe a call back', () => {
    const { getByText, queryByText } = render(
      <CallEvent kind="missed" detail="4m 12s" time="4:08 PM" />
    )
    expect(getByText('Missed call').className).toContain('text-destructive')
    expect(queryByText('4m 12s')).toBeNull()
  })
})

describe('Chat', () => {
  it('the title IS the view, the phone number is the trailing amount, and axe finds nothing', async () => {
    const { container, getByRole, getByText } = render(
      <Chat phone="(512) 555-0148" messages={messages} />
    )
    expect(getByRole('button', { name: /^Messages\(512\)/ })).toBeTruthy()
    expect(getByText('(512) 555-0148')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('the switcher changes the view and the title with it', () => {
    const onViewChange = vi.fn()
    const { getByRole, getByText } = render(
      <Chat phone="(512) 555-0148" messages={messages} calls={calls} onViewChange={onViewChange} />
    )
    fireEvent.click(getByRole('button', { name: 'Calls' }))
    expect(onViewChange).toHaveBeenCalledWith('calls')
    expect(getByText('Outgoing call')).toBeTruthy()
  })

  it('view is controllable and then the component does not move on its own', () => {
    const { getByRole, queryByText } = render(
      <Chat phone="(512) 555-0148" view="calls" messages={messages} calls={calls} />
    )
    fireEvent.click(getByRole('button', { name: 'Messages' }))
    expect(queryByText('Order received.')).toBeNull()
  })

  it('sending trims, calls onSend and clears the uncontrolled draft', () => {
    const onSend = vi.fn()
    const { getByRole, getByLabelText } = render(
      <Chat phone="(512) 555-0148" messages={messages} onSend={onSend} />
    )
    const field = getByLabelText('Text (512) 555-0148') as HTMLInputElement
    fireEvent.change(field, { target: { value: '  on its way  ' } })
    fireEvent.click(getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('on its way')
    expect(field.value).toBe('')
  })

  it('an empty draft sends nothing', () => {
    const onSend = vi.fn()
    const { getByRole } = render(<Chat phone="(512) 555-0148" onSend={onSend} />)
    fireEvent.click(getByRole('button', { name: 'Send' }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('the composer stays in Empty - an empty thread is the one you start', () => {
    const { getByRole, getByText } = render(<Chat phone="(512) 555-0148" />)
    expect(getByText('No messages yet')).toBeTruthy()
    expect(getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('the Calls view puts one full-width Call button where the composer would be', () => {
    const onCall = vi.fn()
    const { getByRole } = render(
      <Chat phone="(512) 555-0148" defaultView="calls" calls={calls} onCall={onCall} />
    )
    const button = getByRole('button', { name: 'Call (512) 555-0148' })
    expect(button.className).toContain('w-full')
    fireEvent.click(button)
    expect(onCall).toHaveBeenCalled()
  })

  it('the Calls empty state keeps the Call button, and says what fills the log', () => {
    const { getByRole, getByText } = render(<Chat phone="(512) 555-0148" defaultView="calls" />)
    expect(getByText('No calls yet')).toBeTruthy()
    expect(getByRole('button', { name: 'Call (512) 555-0148' })).toBeTruthy()
  })

  it('Open=False keeps just the header, same contract as Accordion', () => {
    const { getByRole, queryByText } = render(
      <Chat phone="(512) 555-0148" messages={messages} defaultOpen={false} />
    )
    expect(
      getByRole('button', { name: /^Messages\(512\)/ }).getAttribute('aria-expanded')
    ).toBe('false')
    expect(queryByText('Order received.')).toBeNull()
  })
})
