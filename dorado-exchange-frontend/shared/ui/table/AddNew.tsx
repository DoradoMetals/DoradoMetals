'use client'

import { useState, InputHTMLAttributes, ComponentType, ReactNode } from 'react'

import { Button } from '@/shared/ui/base/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '@/shared/ui/base/dialog'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { Textarea } from '@/shared/ui/base/textarea'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { RowsPlusTopIcon, XIcon } from '@phosphor-icons/react'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

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

type AddNewProps = {
  createConfig: CreateConfig
  triggerIcon?: ComponentType<{ size?: number; className?: string }>
}

export function AddNew({ createConfig, triggerIcon: TriggerIcon = RowsPlusTopIcon }: AddNewProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of createConfig.fields) {
      initial[field.name] = ''
    }
    return initial
  })

  const handleFieldChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const canSubmit =
    createConfig &&
    (createConfig.canSubmit
      ? createConfig.canSubmit(values)
      : createConfig.fields.every((f) => (values[f.name] ?? '').trim().length > 0))

  const handleSubmit = async () => {
    if (!createConfig || !canSubmit) return

    try {
      await createConfig.createNew(values)

      const reset: Record<string, string> = {}
      for (const field of createConfig.fields) {
        reset[field.name] = ''
      }
      setValues(reset)
      setOpen(false)
    } catch (err) {
      console.error('Create failed', err)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-neutral-800 bg-highest hover:bg-highest border-1 border-border h-10"
        onClick={() => setOpen(true)}
      >
        <TriggerIcon size={28} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogOverlay>
          <DialogContent className='glass-panel'>
            <DialogHeader>
              <DialogTitle className="tracking-widest text-xs text-neutral-600 uppercase mr-auto mb-2">
                {createConfig.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col w-full justify-center items-center">
              <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
                {createConfig.fields.map((field) => {
                  const value = values[field.name] ?? ''

                  const isPhoneField =
                    field.inputType === 'tel' ||
                    field.inputMode === 'tel' ||
                    /phone/i.test(field.name)

                  if (field.render) {
                    return (
                      <div key={field.name} className="w-full">
                        <label className="block text-xs text-neutral-600 mb-1">{field.label}</label>
                        {field.render({
                          value,
                          values,
                          setValue: handleFieldChange,
                        })}
                      </div>
                    )
                  }

                  if (field.isRating) {
                    const numeric = Number(value) || 0

                    return (
                      <div key={field.name} className="w-full flex flex-col items-center gap-2">
                        <label className="block text-xs text-neutral-600 mb-1 w-full">
                          {field.label}
                        </label>
                        <Rating
                          value={numeric}
                          onValueChange={(val) => handleFieldChange(field.name, String(val ?? 0))}
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
                        <label className="block text-xs text-neutral-600 mb-1">{field.label}</label>
                        <div className="relative w-full">
                          <Textarea
                            className="bg-highest border-border min-h-[80px]"
                            value={value}
                            onChange={(e) => handleFieldChange(field.name, e.target.value)}
                            maxLength={field.maxLength}
                          />
                          {value !== '' && (
                            <Button
                              variant="ghost"
                              onClick={() => handleFieldChange(field.name, '')}
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
                    <div key={field.name} className="relative w-full">
                      <FloatingLabelInput
                        label={field.label}
                        type={field.inputType ?? 'text'}
                        inputMode={field.inputMode}
                        autoComplete={field.autoComplete}
                        size="sm"
                        className="bg-highest border-border  h-10"
                        maxLength={field.maxLength}
                        value={value}
                        onChange={(e) => {
                          const raw = e.target.value
                          const next = isPhoneField ? formatPhoneNumber(raw) : raw
                          handleFieldChange(field.name, next)
                        }}
                      />
                      {value !== '' && (
                        <Button
                          variant="ghost"
                          onClick={() => handleFieldChange(field.name, '')}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                          tabIndex={-1}
                          aria-label={`Clear ${field.label}`}
                        >
                          <XIcon size={16} />
                        </Button>
                      )}
                    </div>
                  )
                })}

                <Button
                  variant="default"
                  className="bg-primary text-white hover:text-white p-4 w-full"
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
    </>
  )
}
