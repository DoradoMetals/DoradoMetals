'use client'

import * as React from 'react'

import { Input, type InputProps } from '../input/Input'

export type MaskKind = 'phone' | 'card' | 'expiry' | 'amount' | 'email'

const FORMAT: Record<MaskKind, (raw: string) => string> = {
  phone(raw) {
    const d = raw.replace(/\D/g, '').slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  },
  card(raw) {
    const d = raw.replace(/\D/g, '').slice(0, 19)
    return d.replace(/(.{4})/g, '$1 ').trim()
  },
  expiry(raw) {
    const d = raw.replace(/\D/g, '').slice(0, 4)
    if (d.length <= 2) return d
    return `${d.slice(0, 2)} / ${d.slice(2)}`
  },
  amount(raw) {
    const cleaned = raw.replace(/[^\d.]/g, '')
    const [int = '', frac] = cleaned.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return frac != null ? `${grouped}.${frac.slice(0, 2)}` : grouped
  },
  email: (raw) => raw,
}

const STRIP: Record<MaskKind, (formatted: string) => string> = {
  phone: (f) => f.replace(/\D/g, ''),
  card: (f) => f.replace(/\D/g, ''),
  expiry: (f) => f.replace(/\D/g, ''),
  amount: (f) => f.replace(/,/g, ''),
  email: (f) => f,
}

const ATTRS: Record<MaskKind, Partial<InputProps>> = {
  phone: { inputMode: 'tel', autoComplete: 'tel', placeholder: '(555) 123-4567' },
  card: { inputMode: 'numeric', autoComplete: 'cc-number', placeholder: '4242 4242 4242 4242' },
  expiry: { inputMode: 'numeric', autoComplete: 'cc-exp', placeholder: 'MM / YY' },
  amount: { inputMode: 'decimal', placeholder: '0.00' },
  email: {
    inputMode: 'email',
    autoComplete: 'email',
    type: 'email',
    placeholder: 'you@example.com',
  },
}

export type MaskedFieldProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  mask: MaskKind
  value: string
  onValueChange: (raw: string) => void
}

export function MaskedField({ mask, value, onValueChange, ...props }: MaskedFieldProps) {
  return (
    <Input
      {...ATTRS[mask]}
      {...props}
      value={FORMAT[mask](value)}
      onChange={(e) => onValueChange(STRIP[mask](FORMAT[mask](e.target.value)))}
    />
  )
}
