import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { Label } from '@/shared/ui/base/label'
import { cn } from '@/shared/utils/cn'
import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

export default function QuantityBar({
  label = 'Quantity',
  value,
  onChange,
  min = 0,
  step = 1,
  className,
  wrapperClassName,
  labelClassName,
  controlsClassName,
  inputClassName = '',
  buttonClassName = '',
  decButtonClassName,
  incButtonClassName,
}: {
  label?: string
  value: number
  onChange: (next: number) => void
  min?: number
  step?: number

  className?: string
  wrapperClassName?: string
  labelClassName?: string
  controlsClassName?: string
  inputClassName?: string
  buttonClassName?: string
  decButtonClassName?: string
  incButtonClassName?: string
}) {
  const [text, setText] = useState<string>(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const canDec = value > min
  const dec = () => onChange(Math.max(min, value - step))
  const inc = () => onChange(value + step)

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, '')
    if (cleaned === '') {
      setText(String(min))
      onChange(min)
      return
    }
    const n = Math.max(min, parseInt(cleaned, 10))
    setText(String(n))
    onChange(n)
  }

  return (
    <div className={cn('flex flex-col w-full gap-1', className, wrapperClassName)}>
      {/* `text-xs font-medium text-neutral-700` was the hand-rolled spelling of
          Label's own default (37 identical call sites made it the default). */}
      <Label className={cn('pl-1', labelClassName)}>{label}</Label>

      <div className={cn('flex gap-2 w-full', controlsClassName)}>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={dec}
          disabled={!canDec}
          className={cn(buttonClassName, decButtonClassName)}
          aria-label="Decrease quantity"
        >
          <MinusIcon size={16} />
        </Button>

        <Input
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"
          aria-label={label}
          value={text}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d]/g, '')
            setText(cleaned)
            if (cleaned !== '') onChange(Math.max(min, parseInt(cleaned, 10)))
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              inc()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              dec()
            } else if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value)
            }
          }}
          className={cn('flex-1 h-10 text-center', inputClassName)}
        />

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={inc}
          className={cn(buttonClassName, incButtonClassName)}
          aria-label="Increase quantity"
        >
          <PlusIcon size={16} />
        </Button>
      </div>
    </div>
  )
}
