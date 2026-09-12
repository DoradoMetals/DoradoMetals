'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import { Turnstile, siteKey } from '@/shared/ui/auth/Turnstile'

const TOKEN_WAIT_MS = 30_000

export type Captcha = {
  widget: React.ReactNode
  token: () => Promise<string>
  reset: () => void
}

// The token the API's captcha provider verifies. The browser only obtains it;
// whether it passes is the server's decision.
export function useCaptcha(): Captcha {
  const held = useRef('')
  const settled = useRef(false)
  const waiting = useRef<((token: string) => void)[]>([])
  const [round, setRound] = useState(0)
  const on = Boolean(siteKey())

  const receive = useCallback((token: string) => {
    held.current = token
    settled.current = true
    const waiters = waiting.current
    waiting.current = []
    for (const resolve of waiters) resolve(token)
  }, [])

  const token = useCallback(async (): Promise<string> => {
    if (!on) return ''
    if (settled.current) return held.current
    return await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), TOKEN_WAIT_MS)
      waiting.current.push((value) => {
        clearTimeout(timer)
        resolve(value)
      })
    })
  }, [on])

  const reset = useCallback(() => {
    held.current = ''
    settled.current = false
    waiting.current = []
    setRound((previous) => previous + 1)
  }, [])

  const widget = useMemo(
    () => (on ? <Turnstile key={round} onToken={receive} /> : null),
    [on, round, receive]
  )

  return { widget, token, reset }
}
