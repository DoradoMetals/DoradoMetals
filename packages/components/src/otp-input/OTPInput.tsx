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
  const descriptionId = `${React.useId()}-description`
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

  const paste = (event: React.ClipboardEvent) => {
    if (disabled) return
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '')
    if (!pasted) return
    event.preventDefault()
    set(pasted)
    const el = inputRef.current
    if (!el) return
    el.focus()
    const end = Math.min(pasted.length, length)
    requestAnimationFrame(() => el.setSelectionRange(end, end))
  }

  return (
    <div className={cn('flex flex-col gap-md', className)}>
      {(title != null || description != null) && (
        <span className="flex flex-col gap-2xs">
          {title != null && <span className="text-h5 text-foreground">{title}</span>}
          {description != null && (
            <span id={descriptionId} className="text-small text-muted-foreground">
              {description}
            </span>
          )}
        </span>
      )}
      <div className="relative" onPaste={paste}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => set(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onClick={toEnd}
          onKeyDown={toEnd}
          disabled={disabled}
          aria-label={label}
          aria-describedby={description != null ? descriptionId : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
        />
        <div aria-hidden className="flex items-center justify-between gap-sm">
          {Array.from({ length }, (_, i) => {
            const isActive = focused && i === activeIndex && !disabled
            const digit = digits[i]
            return (
              <span
                key={i}
                data-testid="otp-cell"
                className={cn(
                  'flex h-14 min-w-0 max-w-(--control-xl) flex-1 items-center justify-center rounded-lg text-h3',
                  disabled
                    ? 'bg-muted border border-border text-foreground-disabled opacity-50'
                    : cn(
                        'bg-card text-foreground',
                        invalid
                          ? 'border border-destructive text-destructive'
                          : isActive
                            ? 'border-(length:--stroke-emphasis) border-border-strong'
                            : 'border border-border'
                      )
                )}
              >
                {digit ?? ''}
                {isActive && digit === undefined && (
                  <span
                    data-testid="otp-caret"
                    className="animate-caret-blink h-7 w-0.5 bg-foreground"
                  />
                )}
              </span>
            )
          })}
        </div>
      </div>
      {resendIn != null && (
        <span className="flex items-center gap-2xs text-small text-placeholder">
          <span>Didn&apos;t get it?</span>
          {secondsLeft > 0 ? (
            <span className="font-medium text-foreground">{`Resend in ${secondsLeft}s`}</span>
          ) : (
            <Link asChild>
              <button type="button" onClick={() => onResend?.()}>
                Resend code
              </button>
            </Link>
          )}
        </span>
      )}
    </div>
  )
}
