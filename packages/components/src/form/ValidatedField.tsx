'use client'

import * as React from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Eye, EyeOff } from '@dorado/icons'
import { Input, type InputProps } from '../input/Input'
import { Button } from '../button/Button'
import { FormField } from './Form'

export type ValidatedFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  type?: string
  disabled?: boolean
  inputProps?: Partial<InputProps>
  showPasswordButton?: boolean
  className?: string
  showFormError?: boolean
}

export function ValidatedField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  disabled = false,
  inputProps = {},
  showPasswordButton = false,
  className,
  showFormError = true,
}: ValidatedFieldProps<T>) {
  const [revealed, setRevealed] = React.useState(false)
  const masked = type === 'password' && showPasswordButton
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const touched = fieldState.isTouched
        const invalid = touched && !!fieldState.error
        const success = touched && !fieldState.error
        const { onChange: onInputChange, trailing, ...restInputProps } = inputProps

        const trailingControl = masked ? (
          <Button
            type="button"
            variant="tertiary"
            size="iconXs"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            onClick={() => setRevealed((prev) => !prev)}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        ) : (
          trailing
        )

        return (
          <Input
            {...field}
            {...restInputProps}
            onChange={(e) => {
              onInputChange?.(e)
              field.onChange(e)
            }}
            type={masked && revealed ? 'text' : type}
            disabled={disabled}
            label={label}
            className={className}
            invalid={invalid}
            success={success}
            message={showFormError && invalid ? fieldState.error?.message : undefined}
            trailing={trailingControl}
          />
        )
      }}
    />
  )
}
