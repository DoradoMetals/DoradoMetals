import * as recaptcha from '#providers/captcha/recaptcha.ts'
import * as turnstile from '#providers/captcha/turnstile.ts'

export type CaptchaProvider = 'recaptcha' | 'turnstile'

export function providerName(): CaptchaProvider {
  return process.env.CAPTCHA_PROVIDER === 'turnstile' ? 'turnstile' : 'recaptcha'
}

export function verify(token: string, ip: string | null): Promise<boolean> {
  return providerName() === 'turnstile' ? turnstile.verify(token, ip) : recaptcha.verify(token, ip)
}
