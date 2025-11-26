'use client'

import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { FloatingLabelInput, FloatingLabelInputProps } from '@/components/ui/floating-label-input'
import { InvalidXIcon, ValidCheckIcon } from '@/components/ui/valid-check-icon'
import { Control, FieldPath, FieldValues } from 'react-hook-form'
import ShowPasswordButton from '../custom/auth/showPasswordButton'
import { Dispatch, SetStateAction } from 'react'
import { cn } from '@/lib/utils'

type ValidatedFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  type?: string
  rightAligned?: boolean
  disabled?: boolean

  inputProps?: Partial<FloatingLabelInputProps>

  showPasswordButton?: boolean
  showPassword?: boolean
  setShowPassword?: Dispatch<SetStateAction<boolean>>

  className?: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  messageClassName?: string

  showOnTouch?: boolean
  showFormError?: boolean
}

export function ValidatedField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  rightAligned = false,
  disabled = false,
  inputProps = {},
  showPasswordButton = false,
  showPassword,
  setShowPassword,
  className = 'input-floating-label-form',
  size = 'sm',
  showIcon = true,
  messageClassName = 'absolute right-0 -bottom-5.5 -translate-y-1/2 text-xs text-destructive',
  showOnTouch = false,
  showFormError = true,
}: ValidatedFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const mergedOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          inputProps.onChange?.(e)
          field.onChange(e)
        }
        const allowShowIcon = showIcon && (showOnTouch ? fieldState.isTouched : true)

        return (
          <FormItem>
            <div className="relative w-full py-1">
              {showFormError && fieldState.isTouched && fieldState.error && (
                <FormMessage className={messageClassName} />
              )}

              <FormControl>
                <div className="relative">
                  <FloatingLabelInput
                    {...field}
                    {...inputProps}
                    onChange={mergedOnChange}
                    type={type}
                    label={label}
                    className={cn(className, rightAligned ? 'text-right' : 'text-left')}
                    size={size}
                    pattern={type === 'number' ? '[0-9]*' : undefined}
                    disabled={disabled}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center space-x-2 pr-2">
                    {showPasswordButton && showPassword !== undefined && setShowPassword && (
                      <ShowPasswordButton
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                      />
                    )}
                    {allowShowIcon && (fieldState.error ? <InvalidXIcon /> : <ValidCheckIcon />)}
                  </div>
                </div>
              </FormControl>
            </div>
          </FormItem>
        )
      }}
    />
  )
}
