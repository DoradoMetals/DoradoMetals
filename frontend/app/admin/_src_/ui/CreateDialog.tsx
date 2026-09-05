'use client'

import { InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from 'react'

import { Button } from '@dorado/components'
import { X } from '@dorado/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  Input,
  Textarea,
} from '@dorado/components'
import { Rating, RatingButton } from '@dorado/components'
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
  const fieldsKey = createConfig.fields.map((f) => f.name).join('|')
  const initialValues = useMemo(() => buildInitialValues(createConfig.fields), [fieldsKey])
  const [values, setValues] = useState<Record<string, string>>(initialValues)

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
        <DialogContent className={className}>
          <DialogHeader>
            <DialogTitle className="eyebrow mr-auto mb-2">{createConfig.title}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col w-full justify-center items-center">
            <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
              {createConfig.fields.map((field) => {
                const value = values[field.name] ?? ''

                const fieldId = `create-${field.name}`

                const isPhoneField =
                  field.inputType === 'tel' ||
                  field.inputMode === 'tel' ||
                  /phone/i.test(field.name)

                if (field.render) {
                  return (
                    <div key={field.name} className="w-full">
                      <label htmlFor={fieldId} className="block mb-1">
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
                      <label htmlFor={fieldId} className="block mb-1 w-full">
                        {field.label}
                      </label>
                      <Rating
                        value={numeric}
                        onValueChange={(val) => setValue(field.name, String(val ?? 0))}
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <RatingButton key={i} size={32} />
                        ))}
                      </Rating>
                    </div>
                  )
                }

                if (field.multiline) {
                  return (
                    <div key={field.name} className="w-full flex flex-col gap-1">
                      <Textarea
                        id={fieldId}
                        name={field.name}
                        label={field.label}
                        className="min-h-20"
                        value={value}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        maxLength={field.maxLength}
                      />
                      {value !== '' && (
                        <Button
                          type="button"
                          variant="tertiary"
                          size="xs"
                          onClick={() => setValue(field.name, '')}
                          className="self-end"
                          aria-label={`Clear ${field.label}`}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  )
                }

                return (
                  <Input
                    key={field.name}
                    id={fieldId}
                    name={field.name}
                    label={field.label}
                    type={field.inputType ?? 'text'}
                    inputMode={field.inputMode}
                    autoComplete={field.autoComplete}
                    maxLength={field.maxLength}
                    value={value}
                    onChange={(e) => {
                      const raw = e.target.value
                      const next = isPhoneField ? formatPhoneNumber(raw) : raw
                      setValue(field.name, next)
                    }}
                    trailing={
                      value !== '' ? (
                        <Button
                          type="button"
                          variant="tertiary"
                          size="iconXs"
                          onClick={() => setValue(field.name, '')}
                          aria-label={`Clear ${field.label}`}
                        >
                          <X size={14} />
                        </Button>
                      ) : undefined
                    }
                  />
                )
              })}

              <Button
                variant="secondary"
                className={'p-4 w-full'}
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
