'use client'

import { FormField, FormItem, FormControl, FormMessage } from '@/shared/ui/base/form'
import { FloatingLabelInput, FloatingLabelInputProps } from '@/shared/ui/inputs/FloatingLabelInput'
import { Input } from '@dorado/components'
import { InvalidXIcon, ValidCheckIcon } from '@/shared/ui/form/ValidCheckIcon'
import { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Dispatch, SetStateAction } from 'react'
import { cn } from '@/shared/utils/cn'
import ShowPasswordButton from '@/shared/ui/form/ShowPasswordButton'

/* THE FIELD HAS NO SURFACE OF ITS OWN. It renders an `Input`, and `Input` has
   exactly one appearance (ruling 28) - so this component adds none.

   WHAT WAS HERE. Two defects, then briefly a third:

     1. There was no variant, so the nine call sites that wanted a filled field
        on a panel wrote `bg-highest border-1 border-border` by hand.
     2. `className` DEFAULTED to the appearance (`'border-none bg-card'`) and
        was passed straight through, so a caller adding one layout class
        REPLACED the field's entire surface. Five more call sites re-spelled
        the default just to append something. That is not an override, it is a
        default with no way to keep it.
     3. The fix for both was a `card | filled | outline` axis. That was still
        three looks for one control, and Jacob's ruling on `Input` applies with
        the same force here: "We only want one input."

   So the axis is gone and `className` is LAYOUT ONLY. Every field in the app
   is now the single hairline field defined in `base/input.tsx`, whether it is
   reached directly, through here, or through a searchable dropdown. */

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

  /** LAYOUT ONLY - width, alignment, grid placement. Never appearance. */
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
  className,
  size = 'sm',
  showIcon = true,
  messageClassName = 'absolute right-0 -bottom-5.5 -translate-y-1/2 text-micro text-destructive',
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
                      className={cn(
                        rightAligned ? 'text-right' : 'text-left',
                        'pr-12',
                        className
                      )}
                      size={size}
                      pattern={type === 'number' ? '[0-9]*' : undefined}
                      disabled={disabled}
                    />
                  ) : (
                    <Input
                      {...field}
                      {...(inputProps as React.InputHTMLAttributes<HTMLInputElement>)}
                      onChange={mergedOnChange}
                      type={type}
                      disabled={disabled}
                      label={label}
                      inputClassName={cn(
                        rightAligned ? 'text-right' : 'text-left',
                        'pr-12',
                        className
                      )}
                    />
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
