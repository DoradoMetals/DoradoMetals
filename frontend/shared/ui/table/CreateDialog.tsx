'use client'

import { InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from 'react'
import { XIcon } from '@phosphor-icons/react'

import { Button } from '@/shared/ui/base/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '@/shared/ui/base/dialog'
import { Input } from '@/shared/ui/base/input'
import { Textarea } from '@/shared/ui/base/textarea'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { cn } from '@/shared/utils/cn'

type InputType = InputHTMLAttributes<HTMLInputElement>['type']
type InputMode = InputHTMLAttributes<HTMLInputElement>['inputMode']

export type CreateFieldConfig = {
  name: string
  label: string
  inputType?: InputType
  inputMode?: InputMode
  autoComplete?: string
  maxLength?: number
  multiline?: boolean
  isRating?: boolean
  render?: (args: {
    value: string
    values: Record<string, string>
    setValue: (name: string, value: string) => void
  }) => ReactNode
}

export type CreateConfig = {
  title: string
  submitLabel: string
  fields: CreateFieldConfig[]
  createNew: (values: Record<string, string>) => Promise<void> | void
  canSubmit?: (values: Record<string, string>) => boolean
}

function buildInitialValues(fields: CreateFieldConfig[]) {
  const initial: Record<string, string> = {}
  for (const field of fields) initial[field.name] = ''
  return initial
}

type AddNewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  createConfig: CreateConfig
  className?: string
  resetOnClose?: boolean
}

export function AddNewDialog({
  open,
  onOpenChange,
  createConfig,
  className,
  resetOnClose = true,
}: AddNewDialogProps) {
  // Parents build `createConfig` as a fresh object literal every render, so
  // `createConfig.fields` is a new reference each time. Key the memo on the
  // field names (a stable string) so `initialValues` stays referentially
  // stable across parent re-renders and doesn't wipe in-progress input.
  const fieldsKey = createConfig.fields.map((f) => f.name).join('|')
  const initialValues = useMemo(() => buildInitialValues(createConfig.fields), [fieldsKey])
  const [values, setValues] = useState<Record<string, string>>(initialValues)

  // reset when closing (optional)
  useEffect(() => {
    if (!open && resetOnClose) setValues(initialValues)
  }, [open, resetOnClose, initialValues])

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const canSubmit =
    createConfig.canSubmit?.(values) ??
    createConfig.fields.every((f) => (values[f.name] ?? '').trim().length > 0)

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      await createConfig.createNew(values)
      setValues(initialValues)
      onOpenChange(false)
    } catch (err) {
      console.error('Create failed', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay>
        <DialogContent className={cn('glass-panel', className)}>
          <DialogHeader>
            <DialogTitle className="tracking-widest text-xs text-neutral-600 uppercase mr-auto mb-2">
              {createConfig.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col w-full justify-center items-center">
            <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
              {createConfig.fields.map((field) => {
                const value = values[field.name] ?? ''

                // EVERY FIELD NEEDS A LABEL THE BROWSER CAN ASSOCIATE.
                //
                // These rendered a bare <label> next to an <input> with no id,
                // no name, no placeholder and no aria-label - so nothing tied
                // the two together. A sighted user reads the text above the
                // box; a screen reader announces "edit text" five times and
                // gives no way to tell Name from Email.
                //
                // This is the dialog EVERY admin create form uses - leads,
                // users, products, reviews - so it was every create form in the
                // admin area. Found while writing a test that could not select
                // a field by its label, which is the same problem a screen
                // reader has.
                const fieldId = `create-${field.name}`

                const isPhoneField =
                  field.inputType === 'tel' ||
                  field.inputMode === 'tel' ||
                  /phone/i.test(field.name)

                if (field.render) {
                  return (
                    <div key={field.name} className="w-full">
                      <label htmlFor={fieldId} className="block text-xs text-neutral-600 mb-1">
                        {field.label}
                      </label>
                      {field.render({ value, values, setValue })}
                    </div>
                  )
                }

                if (field.isRating) {
                  const numeric = Number(value) || 0
                  return (
                    <div key={field.name} className="w-full flex flex-col items-center gap-2">
                      <label htmlFor={fieldId} className="block text-xs text-neutral-600 mb-1 w-full">
                        {field.label}
                      </label>
                      <Rating
                        value={numeric}
                        onValueChange={(val) => setValue(field.name, String(val ?? 0))}
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <RatingButton
                            key={i}
                            size={32}
                            className="transition-transform text-primary"
                          />
                        ))}
                      </Rating>
                    </div>
                  )
                }

                if (field.multiline) {
                  return (
                    <div key={field.name} className="w-full">
                      <label htmlFor={fieldId} className="block text-xs text-neutral-600 mb-1">
                        {field.label}
                      </label>
                      <div className="relative w-full">
                        <Textarea
                          id={fieldId}
                          name={field.name}
                          className="on-glass min-h-[80px]"
                          value={value}
                          onChange={(e) => setValue(field.name, e.target.value)}
                          maxLength={field.maxLength}
                        />
                        {value !== '' && (
                          <Button
                            variant="ghost"
                            onClick={() => setValue(field.name, '')}
                            className="absolute right-1 top-1 text-neutral-600 hover:bg-transparent"
                            tabIndex={-1}
                            aria-label={`Clear ${field.label}`}
                          >
                            <XIcon size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={field.name} className="w-full">
                    <label htmlFor={fieldId} className="block text-xs text-neutral-600 mb-1">
                      {field.label}
                    </label>
                    <div className="relative w-full">
                      <Input
                        id={fieldId}
                        name={field.name}
                        type={field.inputType ?? 'text'}
                        inputMode={field.inputMode}
                        autoComplete={field.autoComplete}
                        className="on-glass h-10"
                        maxLength={field.maxLength}
                        value={value}
                        onChange={(e) => {
                          const raw = e.target.value
                          const next = isPhoneField ? formatPhoneNumber(raw) : raw
                          setValue(field.name, next)
                        }}
                      />
                      {value !== '' && (
                        <Button
                          variant="ghost"
                          onClick={() => setValue(field.name, '')}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                          tabIndex={-1}
                          aria-label={`Clear ${field.label}`}
                        >
                          <XIcon size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}

              <Button
                variant="default"
                className={cn('p-4 w-full', 'primary-on-glass', 'hover:bg-primary/30!')}
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {createConfig.submitLabel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogOverlay>
    </Dialog>
  )
}
