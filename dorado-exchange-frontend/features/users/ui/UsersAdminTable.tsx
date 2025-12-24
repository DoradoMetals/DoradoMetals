'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { useCreateUser } from '@/features/auth/queries'
import { AdminUser, userRoleOptions } from '@/features/users/types'

import { useDrawerStore } from '@/shared/store/drawerStore'

import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, DateColumn } from '@/shared/ui/table/Columns'

import { cn } from '@/shared/utils/cn'
import { isValidEmail } from '@/shared/utils/isValid'
import { PlusIcon } from '@phosphor-icons/react'
import { CreateConfig } from '@/shared/ui/table/AddNew'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import AdminUsersDrawer from '@/features/users/ui/UsersDrawer'
import { useAdminUsers } from '@/features/users/queries'
import { CreateSalesOrderDrawer } from '@/features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer'

export function UsersPage() {
  const { data: users = [] } = useAdminUsers()
  const createUser = useCreateUser()
  const { openDrawer } = useDrawerStore()

  const [activeUser, setActiveUser] = React.useState<string | null>(null)


  const columns: ColumnDef<AdminUser>[] = React.useMemo(
    () => [
      TextColumn<AdminUser>({
        id: 'name',
        header: 'Name',
        accessorKey: 'name',
        align: 'left',
        enableHiding: false,
        textClassName: 'inline-flex items-center gap-2 text-xs sm:text-sm',
        formatValue: (_value, row) => {
          const role =
            userRoleOptions.find((r) => r.value === row.role) ?? userRoleOptions[1]
          const Icon = role.icon
          return (
            <>
              <Icon size={20} className={role.colorClass} />
              <span className={cn('truncate', role.colorClass)}>{row.name}</span>
            </>
          )
        },
        size: 220,
      }),

      TextColumn<AdminUser>({
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        align: 'left',
        enableHiding: false,
        hideOnSmall: true,
        textClassName:
          'hidden sm:block w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs sm:text-sm text-neutral-900',
        size: 260,
      }),

      DateColumn<AdminUser>({
        id: 'created_at',
        header: 'Created On',
        accessorKey: 'created_at',
        align: 'left',
        hideOnSmall: true,
        size: 200,
      }),

      TextColumn<AdminUser>({
        id: 'dorado_funds',
        header: 'Dorado Credit',
        accessorKey: 'dorado_funds',
        align: 'right',
        enableHiding: true,
        hideOnSmall: true,
        textClassName: '',
        formatValue: (_value, row) => <PriceNumberFlow value={row.dorado_funds} />,
        size: 160,
      }),
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


  const handleRowClick = (row: Row<AdminUser>) => {
    setActiveUser(row.original.id)
    openDrawer('users')
  }

  return (
    <>
      <DataTable<AdminUser>
        data={users}
        columns={columns}
        initialPageSize={12}
        searchColumnId="name"
        searchPlaceholder="Search by user name..."
        enableColumnVisibility
        onRowClick={handleRowClick}
        getRowClassName={() =>
          'hover:bg-background hover:cursor-pointer'
        }
        createIcon={PlusIcon}
        createConfig={createConfig}
      />

      {activeUser && <AdminUsersDrawer user_id={activeUser} users={users} />}
      {activeUser && <CreateSalesOrderDrawer />}
    </>
  )
}
