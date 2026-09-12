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
