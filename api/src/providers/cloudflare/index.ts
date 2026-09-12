import * as fake from '#providers/cloudflare/fake.ts'
import * as turnstile from '#providers/cloudflare/turnstile.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import type { CaptchaProvider } from '#providers/cloudflare/types.ts'

export type { CaptchaProvider } from '#providers/cloudflare/types.ts'

export type CaptchaChoice = 'turnstile' | 'fake'

export function selected(): CaptchaChoice {
  if (isTestRun()) return 'fake'
  return process.env.TURNSTILE_SECRET_KEY ? 'turnstile' : 'fake'
}

export function isFake(): boolean {
  return selected() === 'fake'
}

function provider(): CaptchaProvider {
  if (selected() === 'turnstile') return turnstile
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'refusing to use the captcha fake in production. Set TURNSTILE_SECRET_KEY so ' +
        'Cloudflare answers for every send - a production process must never wave a bot through.'
    )
  }
  return fake
}

export async function verify(token: string, ip: string | null): Promise<boolean> {
  return provider().verify(token, ip)
}
