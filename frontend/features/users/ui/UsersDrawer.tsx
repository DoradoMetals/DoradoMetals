'use client'

import type { AdminUser } from "@dorado/contracts";
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useMemo, useState } from 'react'

import { formatFullDate } from '@/shared/utils/formatDates'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import {
  useChangeEmail,
  useImpersonateUser,
  useRequestPasswordReset,
  useUpdateUser,
} from '@/features/auth/queries'
import { Amount, Button, Divider, Drawer, Input, RadioGroup, RadioOption } from '@dorado/components'
import { Minus, Pen, Plus } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'
import { useUpdateCredit } from '@dorado/client'

export default function AdminUsersDrawer({
  users,
  user_id,
}: {
  users: AdminUser[]
  user_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'users'

  const user = useMemo(() => users.find((u) => u.id === user_id), [users, user_id])

  if (!user) {
    return null
  }

  return (
    <Drawer label="User" open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex items-center justify-between w-full">
        <h3>{user.name}</h3>
        <time dateTime={user.created_at ?? undefined}>{formatFullDate(user.created_at)}</time>
      </div>
      <Divider />
      <div className="space-y-8">
        <UserInfo user={user} />
        <Divider />
        <DoradoCredit user={user} />
        <Divider />
        <UserActions user={user} />
        <Divider />
        <UserOrders user={user} />
      </div>
    </Drawer>
  )
}

function UserInfo({ user }: { user: AdminUser }) {
  const changeEmail = useChangeEmail()
  const updateName = useUpdateUser()

  return (
    <div className="flex flex-col gap-6 w-full items-start items-stretch">
      <p className="eyebrow mb-2">User Information</p>
      <FloatingLabelInput
        label="Name"
        type="name"
        autoComplete="name"
        className="w-full"
        defaultValue={user.name ?? ''}
        onBlur={(e) => updateName.mutate({ name: e.target.value })}
      />
      <FloatingLabelInput
        label="Email"
        type="email"
        autoComplete="email"
        className="w-full"
        defaultValue={user.email}
        onBlur={(e) => changeEmail.mutate(e.target.value)}
      />
      <Button variant="secondary" className="w-full" disabled={true}>
        Upload Identity Images
      </Button>
    </div>
  )
}

const modes = [
  { label: 'Add', value: 'add', icon: Plus },
  { label: 'Subtract', value: 'subtract', icon: Minus },
  { label: 'Edit', value: 'edit', icon: Pen },
]

function DoradoCredit({ user }: { user: AdminUser }) {
  const [mode, setMode] = useState<'add' | 'subtract' | 'edit'>('add')
  const [amount, setAmount] = useState<number>(0)
  const [displayAmount, setDisplayAmount] = useState<string>('0.00')

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    const num = parseFloat(raw)

    const clamped = isNaN(num) ? 0 : num
    setAmount(clamped)
    setDisplayAmount(clamped.toFixed(2))
  }

  const updateCredit = useUpdateCredit()

  const wouldBeNegative =
    (mode === 'subtract' && (user.dorado_funds ?? 0) - amount < 0) ||
    (mode === 'edit' && amount < 0)

  const newAmount =
    mode === 'add'
      ? (user.dorado_funds ?? 0) + amount
      : mode === 'subtract'
      ? (user.dorado_funds ?? 0) - amount
      : amount

  const handleSubmit = () => {
    const current = user.dorado_funds ?? 0
    if ((mode === 'subtract' && current - amount < 0) || (mode === 'edit' && amount < 0)) {
      return
    }

    // Send what the admin DID, not what we think the balance becomes. The
    // server applies the delta under a row lock; `newAmount` above stays as the
    // PREVIEW rendered below, which is fine - previewing is not writing.
    updateCredit.mutate({ user_id: user.id, body: { op: mode, amount } })

    setAmount(0)
    setDisplayAmount('0.00')
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex w-full justify-between items-end">
        <p className="eyebrow mb-2">Dorado Credit</p>
        <strong className="pr-3">
          <Amount value={user.dorado_funds} />
        </strong>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <RadioGroup
          value={mode}
          onValueChange={(val) => setMode(val as 'add' | 'subtract' | 'edit')}
          className="flex w-full items-center gap-1"
        >
          {modes.map((m) => (
            <RadioOption key={m.value} value={m.value} variant="segment" className="w-full gap-1">
              {m.label}
              <m.icon size={20} />
            </RadioOption>
          ))}
        </RadioGroup>
        <Input
          type="text"
          inputMode="decimal"
          value={`$${displayAmount}`}
          onChange={handleAmountChange}
          placeholder="$0.00"
          inputClassName="text-right"
        />
      </div>

      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center justify-between w-full">
          <p>New:</p>

          <strong className="pr-3">
            <Amount value={newAmount} />
          </strong>
        </div>

        <Button
          variant="secondary"
          onClick={handleSubmit}
          className="w-full"
          disabled={updateCredit.isPending || !amount || wouldBeNegative}
        >
          Update Credit
        </Button>
        {wouldBeNegative && (
          <p className="text-left text-destructive">Cannot result in negative credit.</p>
        )}
      </div>
    </div>
  )
}

function UserActions({ user }: { user: AdminUser }) {
  const requestPasswordReset = useRequestPasswordReset()
  const impersonateUser = useImpersonateUser()
  const { closeDrawer } = useDrawerStore()
  return (
    <div className="flex flex-col gap-2 w-full items-start items-stretch">
      <p className="eyebrow mb-2">Actions</p>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          closeDrawer()
          impersonateUser.mutate({ user_id: user.id })
        }}
      >
        Impersonate User
      </Button>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => requestPasswordReset.mutate(user?.email ?? '')}
      >
        {requestPasswordReset.isPending ? 'Sending...' : 'Send Password Reset'}
      </Button>
    </div>
  )
}

function UserOrders({ user }: { user: AdminUser }) {
  const { openDrawer, setCreateSalesOrderUser } = useDrawerStore()
  return (
    <div className="flex flex-col gap-2 w-full items-start items-stretch">
      <p className="eyebrow mb-2">Orders</p>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setCreateSalesOrderUser(user)
          openDrawer('createSalesOrder')
        }}
      >
        Create Sales Order
      </Button>
    </div>
  )
}
