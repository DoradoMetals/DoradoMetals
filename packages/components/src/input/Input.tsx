'use client'

import * as React from 'react'
import { fieldTrigger, FieldLabel } from '../field/Field'
import { cn } from '../cn'

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: React.ReactNode
  message?: React.ReactNode
  invalid?: boolean
  success?: boolean
  leading?: React.ReactNode
  leadingLabel?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
  inputClassName?: string
}

const NUMBER_FIELD =
  '[&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      message,
      invalid,
      success,
      leading,
      leadingLabel,
      trailing,
      className,
      inputClassName,
      id,
      disabled,
      readOnly,
      type,
      inputMode,
      'aria-describedby': describedBy,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId()
    const inputId = id ?? autoId
    const messageId = `${inputId}-message`
    const isNumber = type === 'number'

    return (
      <div className={cn('flex w-full flex-col gap-3xs', className)}>
        {label != null && (
          <FieldLabel
            htmlFor={inputId}
            className={cn(
              invalid && 'text-destructive',
              success && 'text-success',
              disabled && 'text-foreground-disabled'
            )}
          >
            {label}
          </FieldLabel>
        )}
        <div
          data-invalid={invalid || undefined}
          data-disabled={disabled || undefined}
          data-readonly={readOnly || undefined}
          className={cn(fieldTrigger(), success && 'border-success')}
        >
          {leading != null && (
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
              {leading}
            </span>
          )}
          {leadingLabel != null && (
            <span className="flex shrink-0 items-center text-field text-muted-foreground">
              {leadingLabel}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={invalid || undefined}
            aria-describedby={
              [message != null ? messageId : null, describedBy].filter(Boolean).join(' ') ||
              undefined
            }
            type={type}
            inputMode={inputMode ?? (isNumber ? 'decimal' : undefined)}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-field text-foreground outline-none placeholder:text-placeholder',
              'disabled:cursor-not-allowed disabled:text-foreground-disabled',
              'read-only:cursor-default',
              isNumber && NUMBER_FIELD,
              inputClassName
            )}
            {...props}
          />
          {trailing != null && (
            <span className="flex shrink-0 items-center text-small text-muted-foreground [&>svg]:size-4">
              {trailing}
            </span>
          )}
        </div>
        {message != null && (
          <p
            id={messageId}
            className={cn(
              'text-micro',
              invalid ? 'text-destructive' : success ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {message}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
