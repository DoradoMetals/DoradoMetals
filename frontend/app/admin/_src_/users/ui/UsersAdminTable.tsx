'use client'

import type { AdminUser } from '@dorado/contracts'
import * as React from 'react'

import { useCreateUser } from '@/shared/hooks/auth/queries'
import { userRoleOptions } from '@/shared/types/users'

import { useDrawerStore } from '@/shared/store/drawerStore'

import { DataTable, type DataTableColumn, Amount, Button } from '@dorado/components'
import { Plus } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'
import { isValidEmail } from '@/shared/utils/isValid'
import AdminUsersDrawer from './UsersDrawer'
import { useAdminUsers } from '@dorado/client'
import { CreateSalesOrderDrawer } from '../../orders/salesOrders/createSalesOrder/createSalesOrderDrawer'
import { AddNewDialog, type CreateConfig } from '../../ui/CreateDialog'

export function UsersPage() {
  const { data: users = [] } = useAdminUsers()
  const createUser = useCreateUser()
  const { openDrawer } = useDrawerStore()

  const [activeUser, setActiveUser] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const columns: DataTableColumn<AdminUser>[] = React.useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        cell: ({ row }) => {
          const user = row.original
          const role = userRoleOptions.find((r) => r.value === user.role) ?? userRoleOptions[1]
          const Icon = role.icon
          return (
            <span className="inline-flex items-center gap-2">
              <Icon size={20} className={role.colorClass} />
              <span className={cn('truncate', role.colorClass)}>{user.name}</span>
            </span>
          )
        },
      },

      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="truncate">{row.original.email}</span>,
      },

      {
        accessorKey: 'created_at',
        header: 'Created On',
        enableSorting: true,
        cell: ({ row }) => {
          const raw = row.original.created_at
          if (!raw) return '-'
          return new Date(raw).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        },
      },

      {
        accessorKey: 'dorado_funds',
        header: 'Dorado Credit',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <Amount value={row.original.dorado_funds} />,
      },
    ],
    []
  )

  const createConfig: CreateConfig = React.useMemo(
    (): CreateConfig => ({
      title: 'Create New User',
      submitLabel: 'Create User',
      fields: [
        {
          name: 'email',
          label: 'Email',
          inputType: 'email',
          autoComplete: 'email',
        },
        {
          name: 'name',
          label: 'Name',
          inputType: 'text',
          autoComplete: 'name',
        },
      ],
      createNew: (values) => {
        const email = values.email ?? ''
        const name = values.name ?? ''
        const userName = name === '' ? 'New User' : name
        createUser.mutate({ email, name: userName })
      },
      canSubmit: (values) => {
        const email = values.email ?? ''
        return isValidEmail(email)
      },
    }),
    [createUser]
  )

  const handleRowClick = (row: AdminUser) => {
    setActiveUser(row.id)
    openDrawer('users')
  }

  return (
    <>
      <DataTable<AdminUser>
        label="Users"
        data={users}
        columns={columns}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        searchable
        searchPlaceholder="Search by user name..."
        actions={
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create User"
            title="Create User"
          >
            <Plus size={20} />
          </Button>
        }
      />

      <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />

      {activeUser && <AdminUsersDrawer user_id={activeUser} users={users} />}
      {activeUser && <CreateSalesOrderDrawer />}
    </>
  )
}
