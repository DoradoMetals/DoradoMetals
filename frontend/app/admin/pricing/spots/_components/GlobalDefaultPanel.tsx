import { RadioGroup, RadioOption, Text } from '@dorado/components'
import type { SpotSourceRead } from '@dorado/contracts'

import { Panel } from '../../_components'

export type GlobalDefaultPanelProps = {
  sources: SpotSourceRead[]
  mobile: boolean
  onMakeDefault: (source: SpotSourceRead) => void
}

export function GlobalDefaultPanel({ sources, mobile, onMakeDefault }: GlobalDefaultPanelProps) {
  const current = sources.find((source) => source.is_default)?.id
  return (
    <Panel title="Global Default">
      <div className="flex flex-col gap-xs-plus pt-xs-plus">
        <RadioGroup
          aria-label="Global default source"
          value={current}
          onValueChange={(id) => {
            const source = sources.find((entry) => entry.id === id)
            if (source) onMakeDefault(source)
          }}
          className="flex flex-col gap-xs"
        >
          {sources.map((source) => (
            <RadioOption
              key={source.id}
              value={source.id}
              variant="chip"
              disabled={!source.enabled}
              className="justify-start"
            >
              {source.id}
            </RadioOption>
          ))}
        </RadioGroup>
        <Text variant="micro">
          {mobile
            ? 'Applies to every metal unless that metal overrides it. A source that is off cannot be picked.'
            : 'Applies to every metal unless that metal overrides it.'}
        </Text>
      </div>
    </Panel>
  )
}
