import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { Chat, type ChatCall, type ChatMessage, type ChatProps } from './Chat'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const messages: ChatMessage[] = [
  { id: 'm1', direction: 'inbound', time: '9:01 AM', body: 'Is my payout sent?' },
  {
    id: 'm2',
    direction: 'outbound',
    status: 'delivered',
    time: '9:02 AM',
    body: 'Yes, this morning.',
  },
  { id: 'm3', direction: 'outbound', status: 'failed', time: '9:03 AM', body: 'Retry me' },
]

const calls: ChatCall[] = [
  { id: 'c1', kind: 'outgoing', detail: '3:12', agent: 'Ana', time: '8:00 AM' },
  { id: 'c2', kind: 'no-answer', time: '8:10 AM' },
  { id: 'c3', kind: 'incoming', detail: '0:45', time: '8:20 AM' },
  { id: 'c4', kind: 'missed', time: '8:30 AM' },
]

const PHONE = '(555) 010-0199'

const states: [string, Partial<ChatProps>, string][] = [
  ['messages', { messages }, 'Is my payout sent?'],
  ['calls', { calls, defaultView: 'calls' }, 'Missed call'],
  ['loading messages', { status: 'loading' }, 'Loading messages'],
  ['loading calls', { status: 'loading', defaultView: 'calls' }, 'Loading calls'],
  ['error messages', { status: 'error', onRetry: () => {} }, "Couldn't load messages"],
  ['error calls', { status: 'error', defaultView: 'calls' }, "Couldn't load calls"],
  ['closed', { defaultOpen: false }, PHONE],
]

describe('Chat state matrix', () => {
  it.each(states)('%s shows its content and axe finds nothing', async (_name, props, shown) => {
    const { container } = setup(<Chat phone={PHONE} {...props} />)
    const text = container.textContent ?? ''
    const labels = Array.from(container.querySelectorAll('[aria-label]')).map((el) =>
      el.getAttribute('aria-label')
    )
    expect(text.includes(shown) || labels.includes(shown)).toBe(true)
    await expectNoAxeViolations(container)
  })

  it.each([
    ['messages', {}],
    ['calls', { defaultView: 'calls' as const }],
  ])(
    'empty %s: the Empty State title is an h4 under the h3 title and axe finds nothing',
    async (_name, props) => {
      const { container, getByRole } = setup(<Chat phone={PHONE} {...props} />)
      const title = getByRole('heading', { level: 4 })
      expect(title.className).toBe('text-h5')
      await expectNoAxeViolations(container)
    }
  )

  it('the default composer keeps its class list', () => {
    const { getByRole } = setup(<Chat phone={PHONE} />)
    expect(classList(getByRole('textbox', { name: `Text ${PHONE}` }))).toMatchInlineSnapshot(`
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
        "min-h-(--control-md)",
        "placeholder:text-muted-foreground",
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

describe('Chat behaviour', () => {
  it('uncontrolled draft: types, Enter sends trimmed and clears; Shift+Enter does not send', async () => {
    const onSend = vi.fn()
    const onDraftChange = vi.fn()
    const { user, getByRole } = setup(
      <Chat phone={PHONE} onSend={onSend} onDraftChange={onDraftChange} />
    )
    const box = getByRole('textbox') as HTMLInputElement
    await user.type(box, '  hello  ')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(box.value).toBe('')
    expect(onDraftChange).toHaveBeenLastCalledWith('  hello  ')
  })

  it('controlled draft: the draft prop wins, the Send button sends, and the draft is left to the caller', async () => {
    const onSend = vi.fn()
    const onDraftChange = vi.fn()
    const { user, getByRole } = setup(
      <Chat phone={PHONE} draft="Ready" onDraftChange={onDraftChange} onSend={onSend} />
    )
    await user.type(getByRole('textbox'), '!')
    expect(onDraftChange).toHaveBeenCalledWith('Ready!')
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('Ready')
    await user.click(getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Ready')
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('Ready')
  })

  it('a whitespace-only draft sends nothing', async () => {
    const onSend = vi.fn()
    const { user, getByRole } = setup(<Chat phone={PHONE} onSend={onSend} />)
    await user.type(getByRole('textbox'), '   {Enter}')
    await user.click(getByRole('button', { name: 'Send' }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('controlled view: the view prop wins and the switcher reports', async () => {
    const onViewChange = vi.fn()
    const { user, getByRole } = setup(
      <Chat phone={PHONE} view="messages" onViewChange={onViewChange} />
    )
    await user.click(getByRole('button', { name: 'Calls' }))
    expect(onViewChange).toHaveBeenCalledWith('calls')
    expect(getByRole('button', { name: 'Messages' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('the switcher works from the keyboard and the Call button fires', async () => {
    const onCall = vi.fn()
    const { user, getByRole } = setup(<Chat phone={PHONE} calls={calls} onCall={onCall} />)
    getByRole('button', { name: 'Messages' }).focus()
    await user.tab()
    await user.keyboard(' ')
    expect(getByRole('button', { name: 'Calls' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(getByRole('button', { name: `Call ${PHONE}` }))
    expect(onCall).toHaveBeenCalledTimes(1)
    expect(getByRole('list').children).toHaveLength(4)
  })

  it('controlled open: open wins and onToggle reports; uncontrolled toggles itself', async () => {
    const onToggle = vi.fn()
    const { user, getByRole, getByText, unmount } = setup(
      <Chat phone={PHONE} open={false} onToggle={onToggle} />
    )
    await user.click(getByRole('button', { name: /Chat/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(getByText(PHONE)).toBeTruthy()
    unmount()
    const free = setup(<Chat phone={PHONE} defaultOpen={false} />)
    await free.user.click(free.getByRole('button', { name: /Chat/ }))
    expect(free.getByRole('textbox')).toBeTruthy()
    await free.user.click(free.getByRole('button', { name: 'Customer messages' }))
    expect(free.queryByRole('textbox')).toBeNull()
  })

  it('Attach and Try again fire their handlers', async () => {
    const onAttach = vi.fn()
    const onRetry = vi.fn()
    const { user, getByRole, rerender } = setup(<Chat phone={PHONE} onAttach={onAttach} />)
    await user.click(getByRole('button', { name: 'Attach' }))
    expect(onAttach).toHaveBeenCalledTimes(1)
    rerender(<Chat phone={PHONE} status="error" onRetry={onRetry} />)
    await user.click(getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('a long thread renders every message under a custom day label', () => {
    const many: ChatMessage[] = Array.from({ length: 200 }, (_, index) => ({
      id: String(index),
      direction: index % 2 ? 'outbound' : 'inbound',
      time: `${index}`,
      body: `Message ${index}`,
    }))
    const { getByRole, getByText } = setup(
      <Chat phone={PHONE} messages={many} dayLabel="Yesterday" />
    )
    expect(getByRole('log').querySelectorAll('[data-direction], p, div').length).toBeGreaterThan(0)
    expect(getByText('Message 199')).toBeTruthy()
    expect(getByText('Yesterday')).toBeTruthy()
  })
})
