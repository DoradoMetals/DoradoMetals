'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { Button } from '../button/Button'
import { Input } from '../input/Input'
import { RadioGroup, RadioOption } from '../radio/Radio'
import { Slider } from '../slider/Slider'
import { cn } from '../cn'

const estimatorVariants = cva('flex flex-col gap-sm rounded-lg border border-border p-sm', {
  variants: {
    layout: {
      desktop: '',
      mobile: '',
    },
  },
  defaultVariants: { layout: 'desktop' },
})

const gridVariants = cva('flex gap-sm', {
  variants: {
    layout: {
      desktop: 'flex-row gap-lg',
      mobile: 'flex-col',
    },
  },
  defaultVariants: { layout: 'desktop' },
})

export type EstimatorOption = { value: string; label: React.ReactNode }

export type EstimatorChoice = {
  options: EstimatorOption[]
  value?: string
  onValueChange?: (value: string) => void
}

export type EstimatorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  eyebrow?: React.ReactNode
  typeLabel?: React.ReactNode
  metalLabel?: React.ReactNode
  weightLabel?: React.ReactNode
  purityLabel?: React.ReactNode
  type: EstimatorChoice
  metal: EstimatorChoice
  weight: {
    value: string
    onValueChange: (value: string) => void
    unit: EstimatorChoice
  }
  purity: EstimatorChoice & {
    percent?: number
    onPercentChange?: (percent: number) => void
  }
  estimate?: React.ReactNode
  actionLabel?: React.ReactNode
  onAdd?: () => void
  layout?: 'desktop' | 'mobile'
}

function Block({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-small font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Chips({ choice, label }: { choice: EstimatorChoice; label: React.ReactNode }) {
  return (
    <RadioGroup
      aria-label={typeof label === 'string' ? label : undefined}
      value={choice.value}
      onValueChange={choice.onValueChange}
      className="flex flex-wrap gap-xs"
    >
      {choice.options.map((option) => (
        <RadioOption
          key={option.value}
          variant="chip"
          showRadio={false}
          value={option.value}
          className="min-w-24"
        >
          {option.label}
        </RadioOption>
      ))}
    </RadioGroup>
  )
}

export function Estimator({
  eyebrow = 'New item',
  typeLabel = 'Type',
  metalLabel = 'Metal',
  weightLabel = 'Weight',
  purityLabel = 'Purity',
  type,
  metal,
  weight,
  purity,
  estimate,
  actionLabel = 'Add to estimate',
  onAdd,
  layout = 'desktop',
  className,
  ...props
}: EstimatorProps) {
  const typeBlock = (
    <Block label={typeLabel}>
      <Chips choice={type} label={typeLabel} />
    </Block>
  )
  const metalBlock = (
    <Block label={metalLabel}>
      <Chips choice={metal} label={metalLabel} />
    </Block>
  )
  const weightBlock = (
    <Block label={weightLabel}>
      <div className="flex flex-col gap-xs">
        <Input
          aria-label={typeof weightLabel === 'string' ? weightLabel : undefined}
          inputMode="decimal"
          placeholder="0.00"
          value={weight.value}
          onChange={(event) => weight.onValueChange(event.target.value)}
        />
        <Chips choice={weight.unit} label="Unit" />
      </div>
    </Block>
  )
  const purityBlock = (
    <Block label={purityLabel}>
      <Chips choice={purity} label={purityLabel} />
      {purity.onPercentChange && (
        <Slider
          aria-label={typeof purityLabel === 'string' ? purityLabel : 'Purity percent'}
          value={[purity.percent ?? 0]}
          onValueChange={([next]) => purity.onPercentChange?.(next)}
        />
      )}
    </Block>
  )

  return (
    <div data-layout={layout} className={cn(estimatorVariants({ layout }), className)} {...props}>
      <p className="eyebrow text-muted-foreground">{eyebrow}</p>
      {layout === 'desktop' ? (
        <div className={gridVariants({ layout })}>
          <div className="flex flex-1 flex-col gap-sm">
            {typeBlock}
            {purityBlock}
          </div>
          <div className="flex flex-1 flex-col gap-sm">
            {metalBlock}
            {weightBlock}
          </div>
        </div>
      ) : (
        <div className={gridVariants({ layout })}>
          {typeBlock}
          {metalBlock}
          {weightBlock}
          {purityBlock}
        </div>
      )}
      <div className="flex items-center justify-end gap-xs">
        {estimate != null && (
          <p data-slot="estimate" className="mr-auto text-stat-xs text-foreground">
            {estimate}
          </p>
        )}
        <Button variant="secondary" onClick={onAdd}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}
