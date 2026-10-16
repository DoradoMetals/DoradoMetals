'use client'

import * as React from 'react'
import { Button, EntityHeader, Select } from '@dorado/components'
import type { Action, RefiningOrderRead } from '@dorado/contracts'

import { OrderState } from '../../_components/OrderState'
import { useAssignees, usePatchOrder } from '../_api'
import { eyebrowFor, offered, ordersToDate } from '../_lib'
import { RefinerIdentity } from './RefinerIdentity'

const NOBODY = 'nobody'

export type RefinerHeaderProps = {
  view: RefiningOrderRead
  layout: 'desktop' | 'mobile'
  place?: string | null
  onAction: (action: Action, run: () => void) => void
  onCancel: () => void
  onSend: () => void
  onLockOunces?: () => void
  onError?: (error: unknown) => void
}

export function RefinerHeader({
  view,
  layout,
  place,
  onAction,
  onCancel,
  onSend,
  onLockOunces,
  onError,
}: RefinerHeaderProps) {
  const employees = useAssignees().data ?? []
  const patch = usePatchOrder(view.id)
  const [editing, setEditing] = React.useState(false)
  const [refinerId, setRefinerId] = React.useState(view.refiner_id)
  const [locationId, setLocationId] = React.useState<string | null>(view.location_id)

  const editLots = offered(view.actions, 'edit_lots')
  const edit: Action | undefined = editLots && { ...editLots, name: 'edit' }
  const cancel = offered(view.actions, 'cancel')
  const send = view.sent_at === null ? offered(view.actions, 'send') : undefined
  const lock = onLockOunces ? offered(view.actions, 'lock_ounces') : undefined

  const save = () =>
    patch.mutate(
      { refiner_id: refinerId, location_id: locationId, expected_updated_at: view.updated_at },
      { onSuccess: () => setEditing(false), onError }
    )

  const buttons = editing ? (
    <>
      <Button variant="tertiary" onClick={() => setEditing(false)}>
        Discard
      </Button>
      <Button disabled={patch.isPending} onClick={() => edit && onAction(edit, save)}>
        Save
      </Button>
    </>
  ) : edit || cancel || send || lock ? (
    <>
      {edit && (
        <Button
          variant="tertiary"
          onClick={() => {
            setRefinerId(view.refiner_id)
            setLocationId(view.location_id)
            setEditing(true)
          }}
        >
          Edit
        </Button>
      )}
      {cancel && (
        <Button variant="secondary" intent="danger" onClick={() => onAction(cancel, onCancel)}>
          Cancel
        </Button>
      )}
      {send && <Button onClick={() => onAction(send, onSend)}>Send</Button>}
      {lock && onLockOunces && (
        <Button onClick={() => onAction(lock, onLockOunces)}>Lock ounces</Button>
      )}
    </>
  ) : undefined

  return (
    <EntityHeader
      layout={layout}
      eyebrow={eyebrowFor(view.direction, view.state === 'Draft')}
      badge={<OrderState state={view.state} />}
      identity={
        editing ? (
          <RefinerIdentity
            layout={layout}
            refinerId={refinerId}
            locationId={locationId}
            onRefiner={(id) => {
              setRefinerId(id)
              setLocationId(null)
            }}
            onLocation={setLocationId}
          />
        ) : undefined
      }
      title={editing ? undefined : view.refiner?.organization.name}
      reference={editing ? undefined : [view.number, place].filter(Boolean).join(' · ')}
      meta={editing ? undefined : ordersToDate(view.orders_to_date)}
      assignedTo={
        <Select
          label="Assigned to"
          placeholder="Assigned to"
          items={[
            { value: NOBODY, label: 'Unassigned' },
            ...employees
              .filter((employee) => employee.enabled)
              .map((employee) => ({ value: employee.user_id, label: employee.name })),
          ]}
          value={view.assigned_to_id ?? NOBODY}
          onValueChange={(value) =>
            patch.mutate(
              {
                assigned_to_id: value === NOBODY ? null : value,
                expected_updated_at: view.updated_at,
              },
              { onError }
            )
          }
        />
      }
      buttons={buttons}
    />
  )
}
