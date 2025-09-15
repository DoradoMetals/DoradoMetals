export default function formatPhoneNumber(value: string) {
  if (!value) return ''

  const digits = value.replace(/\D/g, '')

  const cleanDigits = digits.startsWith('1') ? digits.slice(1) : digits

  if (cleanDigits.length <= 3) return `(${cleanDigits}`
  if (cleanDigits.length <= 6) return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3)}`
  return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6, 10)}`
}

export function normalizePhone(v: string | null | undefined) {
  let digits = String(v ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  }
  return digits.slice(0, 10)
}
