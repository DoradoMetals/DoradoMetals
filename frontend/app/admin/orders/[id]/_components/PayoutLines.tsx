import * as React from 'react'
import { Input, Select, cn, type SelectItemShape } from '@dorado/components'

export type PayoutLine = {
  key: string
  method: string | null
  payTo?: SelectItemShape[]
  payToId?: string | null
  amount?: string
}

export type PayoutLinePatch = { method?: string; payToId?: string; amount?: string }

export type PayoutLinesProps = {
  lines: PayoutLine[]
  methods: SelectItemShape[]
  layout?: 'desktop' | 'mobile'
  showPayTo?: boolean
  disabled?: boolean
  trailing?: React.ReactNode
  onLineChange?: (index: number, patch: PayoutLinePatch) => void
}

export function PayoutLines({
  lines,
  methods,
  layout = 'desktop',
  showPayTo = true,
  disabled = false,
  trailing,
  onLineChange,
}: PayoutLinesProps) {
  const mobile = layout === 'mobile'
  const split = lines.length > 1
  return (
    <div className="flex flex-col gap-sm">
      {lines.map((line, index) => {
        const payTo = showPayTo && line.payTo && line.payTo.length > 0
        return (
          <div
            key={line.key}
            data-line={index}
            className={cn(
              mobile ? 'flex flex-col gap-sm' : 'flex items-end gap-md',
              !mobile && '[&>*]:min-w-0'
            )}
          >
            <Select
              label="Method"
              placeholder="Method"
              items={methods}
              value={line.method ?? undefined}
              disabled={disabled}
              onValueChange={(method) => onLineChange?.(index, { method })}
              className={mobile ? undefined : split || payTo ? 'flex-[3]' : 'flex-[5]'}
            />
            {payTo && (
              <Select
                label="Pay to"
                placeholder="Pay to"
                items={line.payTo ?? []}
                value={line.payToId ?? undefined}
                disabled={disabled}
                onValueChange={(payToId) => onLineChange?.(index, { payToId })}
                className={mobile ? undefined : 'flex-[4]'}
              />
            )}
            {split && (
              <Input
                label="Amount"
                inputMode="decimal"
                leading="$"
                value={line.amount ?? ''}
                disabled={disabled}
                onChange={(event) => onLineChange?.(index, { amount: event.target.value })}
                className={mobile ? undefined : 'flex-[2]'}
              />
            )}
            {!split && trailing}
          </div>
        )
      })}
    </div>
  )
}
