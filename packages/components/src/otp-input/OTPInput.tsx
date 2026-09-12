'use client'

import * as React from 'react'
import { cn } from '../cn'
import { Link } from '../link/Link'

export type OTPInputProps = {
  length?: number
  value: string
  onValueChange: (value: string) => void
  onComplete?: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  label?: string
  title?: React.ReactNode
  description?: React.ReactNode
  resendIn?: number
  onResend?: () => void
  className?: string
}

export function OTPInput({
  length = 6,
  value,
  onValueChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus = true,
  label = 'One-time code',
  title,
  description,
  resendIn,
  onResend,
  className,
}: OTPInputProps) {
  const [secondsLeft, setSecondsLeft] = React.useState(resendIn ?? 0)
  React.useEffect(() => {
    setSecondsLeft(resendIn ?? 0)
    if (resendIn == null || resendIn <= 0) return
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [resendIn])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [focused, setFocused] = React.useState(false)
  const digits = value.slice(0, length).split('')
  const activeIndex = Math.min(digits.length, length - 1)

  React.useEffect(() => {
    if (!autoFocus || disabled) return
    inputRef.current?.focus()
  }, [autoFocus, disabled])

  const toEnd = () => {
    const el = inputRef.current
    if (!el) return
    const end = el.value.length
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end)
  }

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onValueChange(clean)
    if (clean.length === length && clean !== value) onComplete?.(clean)
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(title != null || description != null) && (
        <span className="flex flex-col gap-1">
          {title != null && <span className="text-h5 font-semibold text-foreground">{title}</span>}
          {description != null && (
            <span className="text-small text-muted-foreground">{description}</span>
          )}
        </span>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => set(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSelect={toEnd}
          onClick={toEnd}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid || undefined}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d*"
          maxLength={length}
          className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
        />
        <div aria-hidden className="flex items-center justify-center gap-sm">
          {Array.from({ length }, (_, i) => {
            const isActive = focused && i === activeIndex && !disabled
            const digit = digits[i]
            return (
              <span
                key={i}
                data-testid="otp-cell"
                className={cn(
                  'flex h-14 min-w-0 max-w-[48px] flex-1 items-center justify-center rounded-lg text-h3 font-semibold',
                  disabled
                    ? 'bg-muted border border-border text-foreground-disabled opacity-50'
                    : cn(
                        'bg-card text-foreground',
                        invalid
                          ? 'border-[1.5px] border-destructive'
                          : isActive
                            ? 'border-[1.5px] border-border-strong'
                            : 'border border-border'
                      )
                )}
              >
                {digit ?? ''}
                {isActive && digit === undefined && (
                  <span
                    data-testid="otp-caret"
                    className="animate-caret-blink h-7 w-[2px] bg-foreground"
                  />
                )}
              </span>
            )
          })}
        </div>
      </div>
      {resendIn != null && (
        <span className="flex items-center gap-1 text-small text-placeholder">
          <span>Didn&apos;t get it?</span>
          {secondsLeft > 0 ? (
            <span className="font-medium text-foreground">{`Resend in ${secondsLeft}s`}</span>
          ) : (
            <Link
              role="button"
              tabIndex={0}
              onClick={() => onResend?.()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onResend?.()
                }
              }}
            >
              Resend code
            </Link>
          )}
        </span>
      )}
    </div>
  )
}
