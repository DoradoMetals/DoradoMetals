import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
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
}: {
  label?: string
  value: number
  onChange: (next: number) => void
  min?: number
  step?: number
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
    <div className={cn('flex flex-col w-full gap-1', className)}>
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div className="flex items-stretch w-full border rounded-lg overflow-hidden raised-off-page bg-card">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dec}
          disabled={!canDec}
          className="h-10 w-10 rounded-none border-r border-border disabled:opacity-40 disabled:cursor-not-allowed bg-neutral-200 hover:bg-neutral-300"
          aria-label="Decrease quantity"
        >
          <MinusIcon size={16} />
        </Button>

        <Input
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"
          aria-label="Quantity"
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
          className={cn(
            'flex-1 h-10 text-center',
            'bg-transparent outline-none focus:outline-none',
            'focus-visible:ring-0 focus-visible:outline-none',
            'border-0'
          )}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={inc}
          className="h-10 w-10 rounded-none border-l border-border bg-neutral-200 hover:bg-neutral-300"
          aria-label="Increase quantity"
        >
          <PlusIcon size={16} />
        </Button>
      </div>
    </div>
  )
}
