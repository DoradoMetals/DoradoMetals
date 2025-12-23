'use client'

import { FormField, FormItem, FormControl, FormMessage } from '@/shared/ui/base/form'
import { FloatingLabelInput, FloatingLabelInputProps } from '@/shared/ui/inputs/FloatingLabelInput'
import { Input } from '@/shared/ui/base/input'
import { Label } from '@/shared/ui/base/label'
import { InvalidXIcon, ValidCheckIcon } from '@/shared/ui/form/ValidCheckIcon'
import { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Dispatch, SetStateAction } from 'react'
import { cn } from '@/lib/utils'
import ShowPasswordButton from '@/shared/ui/form/ShowPasswordButton'

type ValidatedFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  type?: string
  rightAligned?: boolean
  disabled?: boolean

  inputProps?: Partial<FloatingLabelInputProps> & React.InputHTMLAttributes<HTMLInputElement>

  showPasswordButton?: boolean
  showPassword?: boolean
  setShowPassword?: Dispatch<SetStateAction<boolean>>

  className?: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  messageClassName?: string

  showOnTouch?: boolean
  showFormError?: boolean

  floating?: boolean
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
  floating = true,
}: ValidatedFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const mergedOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          ;(inputProps as any).onChange?.(e)
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
                  <div className="absolute inset-y-0 right-0 flex items-center space-x-2 pr-2 z-10">
                    {showPasswordButton && showPassword !== undefined && setShowPassword && (
                      <ShowPasswordButton
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                      />
                    )}
                    {allowShowIcon && (fieldState.error ? <InvalidXIcon /> : <ValidCheckIcon />)}
                  </div>

                  {floating ? (
                    <FloatingLabelInput
                      {...field}
                      {...(inputProps as Partial<FloatingLabelInputProps>)}
                      onChange={mergedOnChange}
                      type={type}
                      label={label}
                      className={cn(className, rightAligned ? 'text-right' : 'text-left', 'pr-12')}
                      size={size}
                      pattern={type === 'number' ? '[0-9]*' : undefined}
                      disabled={disabled}
                    />
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs text-neutral-700">{label}</Label>
                      <Input
                        {...field}
                        {...(inputProps as React.InputHTMLAttributes<HTMLInputElement>)}
                        onChange={mergedOnChange}
                        type={type}
                        disabled={disabled}
                        className={cn(
                          className,
                          rightAligned ? 'text-right' : 'text-left',
                          'pr-12'
                        )}
                      />
                    </div>
                  )}
                </div>
              </FormControl>
            </div>
          </FormItem>
        )
      }}
    />
  )
}
