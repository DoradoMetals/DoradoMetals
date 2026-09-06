// The masking rules the auth design applies to anything identifying that a
// mailer prints back at its reader. A mailer travels through a mailbox that is
// not always the account's own - a forwarded receipt, a shared inbox, a preview
// on a lock screen - so the value confirms WHICH address or number without
// republishing it.
//
// j•••@domain, (•••) •••-0134.

const DOT = '•'

export function maskEmail(value: string | null | undefined): string {
  if (!value) return ''
  const at = value.indexOf('@')
  if (at < 1) return `${DOT.repeat(3)}`
  return `${value.slice(0, 1)}${DOT.repeat(3)}@${value.slice(at + 1)}`
}

export function maskPhone(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return `(${DOT.repeat(3)}) ${DOT.repeat(3)}-${DOT.repeat(4)}`
  return `(${DOT.repeat(3)}) ${DOT.repeat(3)}-${digits.slice(-4)}`
}
