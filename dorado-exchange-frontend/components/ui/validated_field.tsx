'use client'

import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { FloatingLabelInput, FloatingLabelInputProps } from '@/components/ui/floating-label-input'
import { ValidCheckIcon } from '@/components/ui/valid-check-icon'
import { Control, FieldPath, FieldValues } from 'react-hook-form'



type ValidatedFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  type?: string
  rightAligned?: boolean

  inputProps?: Partial<FloatingLabelInputProps>
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  messageClassName?: string
}

export function ValidatedField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  rightAligned = false,
  inputProps = {},
  className = 'input-floating-label-form',
  size = 'sm',
  showIcon = true,
  messageClassName = 'absolute right-0 -bottom-5.5 -translate-y-1/2 error-text',
}: ValidatedFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        // 👇 Merge onChange manually
        const mergedOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          inputProps.onChange?.(e) // your custom logic
          field.onChange(e) // RHF tracking
        }

        return (
          <FormItem>
            <div className="relative w-full">
              {fieldState.isTouched && fieldState.error && (
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
                    className={`${className} ${rightAligned ? 'text-right' : ''}`}
                    size={size}
                    pattern={type === 'number' ? '[0-9]*' : undefined}
                  />
                  {showIcon && <ValidCheckIcon isValid={!fieldState.invalid} />}
                </div>
              </FormControl>
            </div>
          </FormItem>
        )
      }}
    />
  )
}
