import { Button, Field, Input } from '@dorado/components'
import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

/* EIGHT className PROPS, ONE CALL SITE, AND IT PASSED NONE OF THEM.
   `wrapperClassName`, `labelClassName`, `controlsClassName`, `inputClassName`,
   `buttonClassName`, `decButtonClassName` and `incButtonClassName` were all
   dead - appearance-as-props (ruling 20) that nobody had ever used, which is
   the cheapest kind to delete and the easiest to keep by accident. `className`
   survives as the field's own layout slot. The label and the gap above the
   controls are `Field`'s. */

export default function QuantityBar({
  label = 'Quantity',
  value,
  onChange,
  min = 0,
  step = 1,
  className,
}: {
  label?: string
  value: number
  onChange: (next: number) => void
  min?: number
  step?: number
  /** LAYOUT ONLY - the field's width and placement. */
  className?: string
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
    <Field label={label} className={className}>
      <div className="flex gap-2 w-full">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={dec}
          disabled={!canDec}
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
          className="flex-1"
          inputClassName="h-10 text-center"
        />

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={inc}
          aria-label="Increase quantity"
        >
          <PlusIcon size={16} />
        </Button>
      </div>
    </Field>
  )
}
