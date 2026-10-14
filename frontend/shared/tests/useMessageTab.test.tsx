import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const fakes: { data: { sms: boolean; email: boolean } | undefined } = { data: undefined }
const accountMessages = vi.fn()

vi.mock('@dorado/client', () => ({
  useAuthFakes: () => ({ data: fakes.data }),
  accountMessages: () => accountMessages(),
  accountMessageUrl: (id: string) => `/api/account/messages/${encodeURIComponent(id)}`,
}))

const { useMessageTab } = await import('@/shared/hooks/useMessageTab')

const message = (message_id: string) => ({
  message_id,
  channel: 'sms',
  to: '+15125550199',
  subject: null,
  preview: 'code',
  sent_at: '2026-10-13T14:05:00.000Z',
})

const fakeTab = () => ({
  document: { write: vi.fn(), close: vi.fn() },
  location: { href: '' },
  close: vi.fn(),
})

afterEach(() => {
  fakes.data = undefined
  accountMessages.mockReset()
  vi.restoreAllMocks()
})

describe('useMessageTab', () => {
  test('with the fakes off it only sends, and opens nothing', async () => {
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => useMessageTab())
    expect(await result.current.run(async () => 'sent')).toBe('sent')
    expect(open).not.toHaveBeenCalled()
  })

  test('opens the tab in the click, then points it at the message the send produced', async () => {
    fakes.data = { sms: true, email: false }
    const tab = fakeTab()
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    accountMessages
      .mockResolvedValueOnce([message('SMold')])
      .mockResolvedValueOnce([message('SMnew'), message('SMold')])
    const send = vi.fn(async () => 'sent')

    const { result } = renderHook(() => useMessageTab())
    const pending = result.current.run(send)
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(await pending).toBe('sent')
    await vi.waitFor(() => expect(tab.location.href).toBe('/api/account/messages/SMnew'))
  })

  test('retries once when the message has not landed yet, then closes the tab if none came', async () => {
    fakes.data = { sms: false, email: true }
    const tab = fakeTab()
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    accountMessages.mockResolvedValue([])

    const { result } = renderHook(() => useMessageTab())
    await result.current.run(async () => 'sent')
    await vi.waitFor(() => expect(tab.close).toHaveBeenCalled(), { timeout: 2000 })
    expect(accountMessages).toHaveBeenCalledTimes(3)
    expect(tab.location.href).toBe('')
  })

  test('a failed send closes the tab and rethrows', async () => {
    fakes.data = { sms: true, email: true }
    const tab = fakeTab()
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    accountMessages.mockResolvedValue([])

    const { result } = renderHook(() => useMessageTab())
    await expect(
      result.current.run(async () => {
        throw new Error('nope')
      })
    ).rejects.toThrow('nope')
    expect(tab.close).toHaveBeenCalled()
  })
})
