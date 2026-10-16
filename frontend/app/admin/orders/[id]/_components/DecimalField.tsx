'use client'

import * as React from 'react'
import { Input } from '@dorado/components'

import { parseDecimal } from '../_lib'

export const DecimalResetContext = React.createContext(0)

export type DecimalFieldProps = {
  value: number | null | undefined
  format: (value: number | null | undefined) => string
  onCommit?: (value: number | null) => void
  label?: React.ReactNode
  ariaLabel?: string
  unit?: React.ReactNode
  message?: React.ReactNode
  readOnly?: boolean
  disabled?: boolean
  className?: string
}

export function DecimalField({
  value,
  format,
  onCommit,
  label,
  ariaLabel,
  unit,
  message,
  readOnly = false,
  disabled = false,
  className,
}: DecimalFieldProps) {
  const shown = format(value)
  const reset = React.useContext(DecimalResetContext)
  const [text, setText] = React.useState(shown)
  const [source, setSource] = React.useState({ shown, reset })
  if (source.shown !== shown || source.reset !== reset) {
    setSource({ shown, reset })
    setText(shown)
  }
  const locked = readOnly || onCommit == null

  return (
    <Input
      type="text"
      inputMode="decimal"
      label={label}
      aria-label={ariaLabel}
      value={text}
      readOnly={locked}
      disabled={disabled}
      trailing={unit}
      message={message}
      className={className}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (locked || text === shown) return
        const next = parseDecimal(text)
        setText(format(next))
        onCommit?.(next)
      }}
    />
  )
}
