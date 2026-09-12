'use client'

import { useEffect, useRef } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (host: HTMLElement, options: Record<string, unknown>) => string
  remove: (widget: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const siteKey = (): string => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

let loading: Promise<TurnstileApi | null> | null = null

function load(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise<TurnstileApi | null>((resolve) => {
    const tag = document.createElement('script')
    tag.src = SCRIPT_SRC
    tag.async = true
    tag.defer = true
    tag.onload = () => resolve(window.turnstile ?? null)
    tag.onerror = () => resolve(null)
    document.head.appendChild(tag)
  })
  return loading
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const key = siteKey()

  useEffect(() => {
    if (!key) return
    let widget: string | null = null
    let live = true
    void load().then((api) => {
      if (!api || !live || !host.current) return
      widget = api.render(host.current, {
        sitekey: key,
        theme: 'dark',
        callback: onToken,
        'error-callback': () => onToken(''),
        'expired-callback': () => onToken(''),
      })
    })
    return () => {
      live = false
      if (widget) window.turnstile?.remove(widget)
    }
  }, [key, onToken])

  if (!key) return null
  return <div ref={host} data-testid="turnstile" className="flex w-full justify-center" />
}
