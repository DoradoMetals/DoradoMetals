'use client'

import NextLink from 'next/link'
import { useSession } from '@dorado/client'
import { Amount, Button, Input, Skeleton } from '@dorado/components'

import { useGetSession, useUpdateUser } from '@/shared/hooks/auth/queries'
import { cn } from '@/shared/utils/cn'

// THE FACTORS ARE READ-ONLY HERE (ruling 91). An email or a phone moves through
// its own screen, verified by the other one - so this page states the value and
// sends the customer there. A shown value that cannot be edited is a disabled
// Input, never a box built to look like one.
export default function UserForm() {
  const { user, isPending } = useGetSession()
  const { data: session } = useSession({ enabled: !!user?.id })
  const updateUser = useUpdateUser()

  if (isPending) {
    return (
      <section className="w-full rounded-lg bg-card p-4">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
    )
  }

  return (
    <section className="w-full rounded-lg bg-card p-4">
      <div className="mb-6 border-b border-border pb-6">
        <p className="eyebrow mb-6">Details</p>

        <div className="space-y-5">
          <Input
            label="Name"
            type="text"
            autoComplete="name"
            defaultValue={user?.name ?? ''}
            onBlur={(event) => updateUser.mutate({ name: event.target.value })}
          />

          <div className="flex items-end gap-2">
            <Input label="Email" defaultValue={session?.email ?? ''} disabled readOnly />
            <Button variant="secondary" asChild>
              <NextLink href="/settings/email">Change</NextLink>
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Input label="Phone" defaultValue={session?.phone_number ?? ''} disabled readOnly />
            <Button variant="secondary" asChild>
              <NextLink href="/settings/phone">Change</NextLink>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Dorado Credit</p>
        <div className={cn('flex w-full items-baseline justify-between gap-2')}>
          <small>Current balance</small>
          <strong>
            <Amount value={user?.dorado_funds ?? 0} />
          </strong>
        </div>
      </div>
    </section>
  )
}
