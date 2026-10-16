'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, EntityHeader, Select, useMediaUp } from '@dorado/components'
import type { RefiningDirection } from '@dorado/contracts'

import { protectedRoutes } from '@/shared/types/routes'

import { useAssignees, useCreateOrder } from '../_api'
import { eyebrowFor } from '../_lib'
import { RefinerIdentity } from './RefinerIdentity'
import { RefinerSaveFailed } from './RefinerScreenStates'

const NOBODY = 'nobody'

export const refinerOrderPath = (id: string) => `${protectedRoutes.adminOrders.path}/refiners/${id}`

export function RefinerDraft({ direction }: { direction: RefiningDirection }) {
  const router = useRouter()
  const mobile = !useMediaUp('lg')
  const layout = mobile ? 'mobile' : 'desktop'
  const employees = useAssignees().data ?? []
  const create = useCreateOrder()
  const [refinerId, setRefinerId] = React.useState<string | null>(null)
  const [locationId, setLocationId] = React.useState<string | null>(null)
  const [assigneeId, setAssigneeId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-md lg:gap-lg">
      <EntityHeader
        layout={layout}
        eyebrow={eyebrowFor(direction, true)}
        identity={
          <RefinerIdentity
            layout={layout}
            refinerId={refinerId}
            locationId={locationId}
            disabled={create.isPending}
            onRefiner={(id) => {
              setRefinerId(id)
              setLocationId(null)
            }}
            onLocation={setLocationId}
          />
        }
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
            value={assigneeId ?? NOBODY}
            onValueChange={(value) => setAssigneeId(value === NOBODY ? null : value)}
          />
        }
        buttons={
          <>
            <Button
              variant="secondary"
              intent="danger"
              onClick={() => router.push(protectedRoutes.adminOrders.path)}
            >
              Cancel
            </Button>
            <Button
              disabled={refinerId === null || create.isPending}
              onClick={() =>
                refinerId &&
                create.mutate(
                  {
                    refiner_id: refinerId,
                    direction,
                    location_id: locationId,
                    assigned_to_id: assigneeId,
                  },
                  { onSuccess: (order) => router.push(refinerOrderPath(order.id)) }
                )
              }
            >
              Create
            </Button>
          </>
        }
      />
      {create.isError && (
        <RefinerSaveFailed
          stale={false}
          message={create.error.message}
          onReload={() => create.reset()}
          onRetry={() => create.reset()}
        />
      )}
    </div>
  )
}
