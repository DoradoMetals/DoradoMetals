'use client'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge, Button, Switch, Text } from '@dorado/components'
import { GripVertical } from '@dorado/icons'
import type { SpotSourceRead } from '@dorado/contracts'

import { formatAgo, formatStamp } from '../../_lib'
import { Panel } from '../../_components'

export type SourcesPanelProps = {
  sources: SpotSourceRead[]
  now: number
  onToggle: (source: SpotSourceRead, enabled: boolean) => void
  onReorder: (ids: string[]) => void
}

function SourceRow({
  source,
  now,
  onToggle,
}: {
  source: SpotSourceRead
  now: number
  onToggle: (source: SpotSourceRead, enabled: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: source.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-sm bg-card py-xs-plus"
    >
      <div className="flex items-center justify-between gap-xs">
        <div className="flex items-center gap-xs">
          <Button
            ref={setActivatorNodeRef}
            variant="tertiary"
            size="iconInline"
            aria-label={`Drag ${source.name}`}
            className="cursor-grab"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden />
          </Button>
          <Text variant="body-medium" emphasis="default" as="h3">
            {source.name}
          </Text>
          {source.enabled ? (
            <Badge intent="success">On</Badge>
          ) : (
            <Badge intent="neutral">Off</Badge>
          )}
        </div>
        <Switch
          aria-label={`${source.name} on`}
          checked={source.enabled}
          onCheckedChange={(checked) => onToggle(source, checked)}
        />
      </div>
      {source.last_error ? (
        <Text variant="micro">
          <span className="text-destructive">
            {`Last error: ${source.last_error}, ${formatStamp(source.last_attempt_at)}`}
          </span>
        </Text>
      ) : (
        <Text variant="micro">{formatAgo(source.last_tick_at, now)}</Text>
      )}
    </li>
  )
}

export function SourcesPanel({ sources, now, onToggle, onReorder }: SourcesPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const ids = sources.map((source) => source.id)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <Panel title="Sources">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col divide-y divide-border">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} now={now} onToggle={onToggle} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Text variant="micro" className="pt-sm">
        Drag to set the fallback order: when a metal&apos;s source has no fresh tick, the next
        source that is on takes over.
      </Text>
    </Panel>
  )
}
