import { NotFound } from '#shared/errors.ts'
import type { FakeMessage as FakeEmail } from '#providers/resend/fake.ts'
import type { FakeMessage as FakeSms } from '#providers/twilio/fake.ts'
import type { AccountMessage, User } from '@dorado/contracts'

const PREVIEW_LENGTH = 80

const normalEmail = (value: string): string => value.trim().toLowerCase()
const digits = (value: string): string => value.replace(/\D/g, '')
const present = (value: string | null | undefined): value is string => Boolean(value)

export const emailsOf = (user: User | null, email: string | null): string[] =>
  [user?.email, email].filter(present).map(normalEmail)

export const numbersOf = (user: User | null, number: string | null): string[] =>
  [user?.phone_number, number].filter(present).map(digits).filter(Boolean)

export const emailIsFor = (message: FakeEmail, emails: string[]): boolean =>
  emails.includes(normalEmail(message.to))

export const smsIsFor = (message: FakeSms, numbers: string[]): boolean =>
  numbers.includes(digits(message.to))

const preview = (body: string): string =>
  body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body

const emailView = (message: FakeEmail): AccountMessage => ({
  message_id: message.message_id,
  channel: 'email',
  to: message.to,
  subject: message.subject,
  preview: null,
  sent_at: message.sent_at,
})

const smsView = (message: FakeSms): AccountMessage => ({
  message_id: message.provider_sid,
  channel: 'sms',
  to: message.to,
  subject: null,
  preview: preview(message.body),
  sent_at: message.sent_at,
})

export function messagesFor(
  emails: readonly FakeEmail[],
  texts: readonly FakeSms[],
  addresses: string[],
  numbers: string[]
): AccountMessage[] {
  return [
    ...[...texts]
      .reverse()
      .filter((message) => smsIsFor(message, numbers))
      .map(smsView),
    ...[...emails]
      .reverse()
      .filter((message) => emailIsFor(message, addresses))
      .map(emailView),
  ].sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}

export function assertMessage<T>(message: T | null, message_id: string): asserts message is T {
  if (!message) throw new NotFound(`no message ${message_id}`)
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export function maskNumber(number: string): string {
  const all = digits(number)
  return all.length < 4 ? '•••' : `+• (•••) •••-${all.slice(-4)}`
}

const timeOf = (sent_at: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(sent_at)) + ' UTC'

const bodyHtml = (body: string): string =>
  escapeHtml(body)
    .replace(/(?<!\d)(\d{6})(?!\d)/g, '<strong class="code">$1</strong>')
    .replace(/\r?\n/g, '<br>')

const SMS_STYLE =
  '*{box-sizing:border-box}' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e9eaee;' +
  'font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111}' +
  '.phone{width:min(360px,calc(100vw - 32px));min-height:640px;background:#fff;border-radius:40px;' +
  'border:10px solid #16171b;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}' +
  '.head{padding:28px 16px 12px;text-align:center;border-bottom:1px solid #e3e4e8;background:#f7f7f9}' +
  '.avatar{width:44px;height:44px;margin:0 auto 6px;border-radius:50%;background:#a1a5b0;color:#fff;' +
  'display:grid;place-items:center;font-weight:600}' +
  '.from{font-size:13px;color:#555}' +
  '.thread{flex:1;padding:16px 12px;display:flex;flex-direction:column;gap:6px}' +
  '.time{align-self:center;font-size:11px;color:#8a8d96;margin-bottom:4px}' +
  '.bubble{align-self:flex-start;max-width:80%;padding:9px 13px;border-radius:18px 18px 18px 4px;' +
  'background:#e5e5ea;word-wrap:break-word}' +
  '.code{font-weight:700;letter-spacing:.06em}' +
  '.to{padding:10px 16px 14px;font-size:11px;color:#8a8d96;text-align:center;border-top:1px solid #e3e4e8}'

export function smsPage(message: FakeSms): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>Text message</title><style>${SMS_STYLE}</style></head><body>` +
    '<main class="phone" data-testid="sms-message">' +
    '<header class="head"><div class="avatar">D</div>' +
    `<div class="from" data-testid="sms-from">${escapeHtml(maskNumber(message.from))}</div></header>` +
    '<section class="thread">' +
    `<time class="time" datetime="${escapeHtml(message.sent_at)}">${escapeHtml(timeOf(message.sent_at))}</time>` +
    `<div class="bubble" data-testid="sms-body">${bodyHtml(message.body)}</div>` +
    '</section>' +
    `<footer class="to">To ${escapeHtml(message.to)}</footer>` +
    '</main></body></html>'
  )
}
