'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo, useState } from 'react'

import { formatFullDate } from '@/shared/utils/formatDates'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import {
  useChangeEmail,
  useImpersonateUser,
  useRequestPasswordReset,
  useUpdateUser,
} from '@/features/auth/queries'
import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { cn } from '@/shared/utils/cn'
import { MinusIcon, PenIcon, PlusIcon } from '@phosphor-icons/react'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useUpdateCredit } from '@/features/users/queries'
import { AdminUser } from '@/features/users/types'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex items-center justify-between w-full">
        <div className="text-xl text-neutral-900">{user.name}</div>
        <div className="text-base text-neutral-800">{formatFullDate(user.created_at)}</div>
      </div>
      <div className="separator-inset" />
      <UserInfo user={user} />
      <div className="separator-inset" />
      <DoradoCredit user={user} />
      <div className="separator-inset" />
      <UserActions user={user} />
      <div className="separator-inset" />
      <UserOrders user={user} />
    </Drawer>
  )
}

function UserInfo({ user }: { user: AdminUser }) {
  const changeEmail = useChangeEmail()
  const updateName = useUpdateUser()

  return (
    <div className="flex flex-col gap-6 w-full items-start items-stretch">
      <div className="section-label mb-2">User Information</div>
      <FloatingLabelInput
        label="Name"
        type="name"
        autoComplete="name"
        className="input-floating-label-form w-full"
        defaultValue={user.name}
        onBlur={(e) => updateName.mutate({ name: e.target.value })}
      />
      <FloatingLabelInput
        label="Email"
        type="email"
        autoComplete="email"
        className="input-floating-label-form w-full"
        defaultValue={user.email}
        onBlur={(e) => changeEmail.mutate(e.target.value)}
      />
      <Button
        variant="default"
        className="w-full bg-primary raised-off-page text-white"
        disabled={true}
      >
        Upload Identity Images
      </Button>
    </div>
  )
}

const modes = [
  { label: 'Add', value: 'add', icon: PlusIcon },
  { label: 'Subtract', value: 'subtract', icon: MinusIcon },
  { label: 'Edit', value: 'edit', icon: PenIcon },
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

    const updatedUser: AdminUser = {
      ...user,
      dorado_funds: newAmount,
    }

    updateCredit.mutate(updatedUser)

    setAmount(0)
    setDisplayAmount('0.00')
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex w-full justify-between items-end">
        <div className="section-label mb-2">Dorado Credit</div>
        <PriceNumberFlow value={user.dorado_funds} className="text-lg text-neutral-900 pr-3" />
      </div>

      <div className="flex flex-col gap-2 w-full">
        <RadioGroup
          value={mode}
          onValueChange={(val) => setMode(val as 'add' | 'subtract' | 'edit')}
          className="flex items-center w-full gap-1"
        >
          {modes.map((m) => {
            const Icon = m.icon
            return (
              <label
                key={m.value}
                htmlFor={m.value}
                className={cn(
                  'w-full',
                  'text-sm raised-off-page',
                  mode === m.value ? 'bg-primary' : 'bg-card hover:bg-card border-none',
                  'flex items-center justify-center rounded-md cursor-pointer px-2 py-2 transition-colors'
                )}
              >
                <div
                  className={cn(
                    'flex items-center gap-1',
                    mode === m.value ? 'text-white hover:text-white' : 'text-primary'
                  )}
                >
                  {m.label}
                  <Icon size={20} className={cn(mode === m.value ? 'text-white' : 'text-primary')} />
                </div>
                <RadioGroupItem id={m.value} value={m.value} className="sr-only" />
              </label>
            )
          })}
        </RadioGroup>
        <Input
          type="text"
          inputMode="decimal"
          value={`$${displayAmount}`}
          onChange={handleAmountChange}
          placeholder="$0.00"
          className="input-floating-label-form w-full text-right no-spinner text-lg text-neutral-900"
        />
      </div>

      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center justify-between w-full text-sm text-neutral-700">
          <div>New:</div>

          <PriceNumberFlow value={newAmount} className="text-lg text-neutral-900 pr-3" />
        </div>

        <Button
          onClick={handleSubmit}
          className="bg-primary raised-off-page text-white"
          disabled={updateCredit.isPending || !amount || wouldBeNegative}
        >
          Update Credit
        </Button>
        {wouldBeNegative && (
          <div className="text-sm text-destructive text-left">
            Cannot result in negative credit.
          </div>
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
      <div className="section-label mb-2">Actions</div>
      <Button
        variant="default"
        className="w-full bg-primary raised-off-page text-white"
        onClick={() => {
          closeDrawer()
          impersonateUser.mutate({ user_id: user.id })
        }}
      >
        Impersonate User
      </Button>
      <Button
        variant="default"
        className="w-full bg-card raised-off-page hover:bg-card"
        onClick={() => requestPasswordReset.mutate(user?.email ?? '')}
      >
        <div className="text-primary">
          {requestPasswordReset.isPending ? 'Sending...' : 'Send Password Reset'}
        </div>
      </Button>
    </div>
  )
}

function UserOrders({ user }: { user: AdminUser }) {
  const { openDrawer, setCreateSalesOrderUser } = useDrawerStore()
  return (
    <div className="flex flex-col gap-2 w-full items-start items-stretch">
      <div className="section-label mb-2">Orders</div>
      <Button
        variant="default"
        className="w-full bg-primary raised-off-page text-white"
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
