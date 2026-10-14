import { Accordion, RadioGroup, RadioOption, Text } from '@dorado/components'
import type { MetalSpot, SpotSourceRead } from '@dorado/contracts'

import { formatAgo } from '../../../_lib'

export type SourceSectionProps = {
  metal: MetalSpot
  sources: SpotSourceRead[]
  now: number
  className?: string
  onPick: (sourceId: string | null) => void
}

const DEFAULT = 'default'

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-xs py-xs">
      <Text variant="micro">{label}</Text>
      <Text variant="small-medium" emphasis="default">
        {value}
      </Text>
    </div>
  )
}

export function SourceSection({ metal, sources, now, className, onPick }: SourceSectionProps) {
  const using = sources.find((source) => source.id === metal.source_id)
  const choices = sources.filter((source) => source.enabled)
  return (
    <Accordion
      label="Source"
      trailing={metal.source_id ?? 'None'}
      defaultOpen
      flush
      className={className}
    >
      <div className="flex flex-col px-md pb-md">
        <RadioGroup
          aria-label={`${metal.metal_id} source`}
          value={metal.follows_default ? DEFAULT : (metal.source_id ?? DEFAULT)}
          onValueChange={(value) => onPick(value === DEFAULT ? null : value)}
          className="flex gap-xs pb-xs"
        >
          <RadioOption value={DEFAULT} variant="chip" className="flex-1 justify-start">
            Default
          </RadioOption>
          {choices.map((source) => (
            <RadioOption
              key={source.id}
              value={source.id}
              variant="chip"
              className="flex-1 justify-start"
            >
              {source.id}
            </RadioOption>
          ))}
        </RadioGroup>
        <Fact
          label="Using"
          value={
            metal.source_id
              ? `${metal.source_id}, ${metal.follows_default ? 'the global default' : 'set for this metal'}`
              : 'No source'
          }
        />
        <Fact label="Last tick" value={formatAgo(using?.last_tick_at, now)} />
        <Fact label="Last attempt" value={formatAgo(using?.last_attempt_at, now)} />
      </div>
    </Accordion>
  )
}
