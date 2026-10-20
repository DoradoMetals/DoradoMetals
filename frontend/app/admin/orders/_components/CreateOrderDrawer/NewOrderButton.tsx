'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@dorado/components'
import { Plus } from '@dorado/icons'
import { useAdminUser, useSession } from '@dorado/client'

import { protectedRoutes } from '@/shared/types/routes'

import { CreateOrderDrawer, type CreateOrderDrawerProps } from './index'

export function NewOrderButton({
  initial,
  locked,
  layout,
}: Pick<CreateOrderDrawerProps, 'initial' | 'locked' | 'layout'>) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
        New order
      </Button>
      {open && (
        <SignedInDrawer
          initial={initial}
          locked={locked}
          layout={layout}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SignedInDrawer({
  initial,
  locked,
  layout,
  onClose,
}: Pick<CreateOrderDrawerProps, 'initial' | 'locked' | 'layout'> & { onClose: () => void }) {
  const router = useRouter()
  const session = useSession().data
  const user = useAdminUser(session?.user_id ?? null).data
  if (!session || !user) return null
  return (
    <CreateOrderDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      viewer={{
        id: user.id,
        name: user.name ?? 'You',
        role: user.role === 'employee' ? 'employee' : 'owner',
      }}
      initial={initial}
      locked={locked}
      layout={layout}
      onCreated={({ kind, id }) =>
        router.push(
          kind === 'refiner_purchase' || kind === 'refiner_sale'
            ? `${protectedRoutes.adminOrders.path}/refiners/${id}`
            : `${protectedRoutes.adminOrders.path}/${id}`
        )
      }
    />
  )
}
