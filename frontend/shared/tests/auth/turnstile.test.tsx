import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'

import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { Turnstile } from '@/shared/ui/auth/Turnstile'

const KEY = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
const had = process.env[KEY]

type Rendered = { options: Record<string, unknown>; host: HTMLElement }

const rendered: Rendered[] = []
const removed: string[] = []

const stubCloudflare = () => {
  window.turnstile = {
    render: (host: HTMLElement, options: Record<string, unknown>) => {
      rendered.push({ host, options })
      return `widget-${rendered.length}`
    },
    remove: (widget: string) => removed.push(widget),
  }
}

beforeEach(() => {
  rendered.length = 0
  removed.length = 0
  document.head.querySelectorAll('script').forEach((tag) => tag.remove())
})

afterEach(() => {
  delete window.turnstile
  if (had === undefined) delete process.env[KEY]
  else process.env[KEY] = had
})

function Harness() {
  const captcha = useCaptcha()
  const [seen, setSeen] = useState('-')
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setSeen(await captcha.token())
        captcha.reset()
      }}
    >
      {captcha.widget}
      <output data-testid="token">{seen}</output>
      <button type="submit">Send</button>
    </form>
  )
}

describe('with a site key', () => {
  test('the widget is rendered with the site key and the token reaches the form', async () => {
    process.env[KEY] = '0xSITEKEY'
    stubCloudflare()
    render(<Harness />)

    await vi.waitFor(() => expect(rendered.length).toBe(1))
    expect(rendered[0].options.sitekey).toBe('0xSITEKEY')
    expect(screen.getByTestId('turnstile')).toBeTruthy()

    const callback = rendered[0].options.callback as (token: string) => void
    await act(async () => callback('cf-token'))
    await act(async () => {
      screen.getByRole('button', { name: 'Send' }).click()
    })
    expect(screen.getByTestId('token').textContent).toBe('cf-token')
  })

  test('the widget is re-rendered after a submit, so no token is used twice', async () => {
    process.env[KEY] = '0xSITEKEY'
    stubCloudflare()
    render(<Harness />)

    await vi.waitFor(() => expect(rendered.length).toBe(1))
    const callback = rendered[0].options.callback as (token: string) => void
    await act(async () => callback('cf-token'))
    await act(async () => {
      screen.getByRole('button', { name: 'Send' }).click()
    })

    await vi.waitFor(() => expect(rendered.length).toBe(2))
    expect(removed).toEqual(['widget-1'])
  })

  test('an errored widget hands back an empty token rather than hanging the form', async () => {
    process.env[KEY] = '0xSITEKEY'
    stubCloudflare()
    render(<Harness />)

    await vi.waitFor(() => expect(rendered.length).toBe(1))
    const failed = rendered[0].options['error-callback'] as () => void
    await act(async () => failed())
    await act(async () => {
      screen.getByRole('button', { name: 'Send' }).click()
    })
    expect(screen.getByTestId('token').textContent).toBe('')
  })

  test('Cloudflare is asked before the widget exists, never trusted blindly', async () => {
    process.env[KEY] = '0xSITEKEY'
    render(<Turnstile onToken={() => {}} />)
    await vi.waitFor(() =>
      expect(
        document.head.querySelectorAll(
          'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
        ).length
      ).toBe(1)
    )
  })
})

describe('without a site key', () => {
  test('no widget, no script, and an empty token', async () => {
    delete process.env[KEY]
    render(<Harness />)

    expect(screen.queryByTestId('turnstile')).toBeNull()
    expect(document.head.querySelectorAll('script').length).toBe(0)

    await act(async () => {
      screen.getByRole('button', { name: 'Send' }).click()
    })
    expect(screen.getByTestId('token').textContent).toBe('')
    expect(rendered.length).toBe(0)
  })
})
