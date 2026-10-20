'use client'

import * as React from 'react'
import {
  Avatar,
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  EmptyState,
  Input,
  RadioGroup,
  RadioOption,
  Skeleton,
  Spinner,
  Text,
} from '@dorado/components'
import { Search } from '@dorado/icons'
import type { LeadAssignee } from '@dorado/contracts'

import { initialsOf, pluralize } from '../_lib'

export type AssignLeadsDrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  layout?: 'desktop' | 'mobile'
  count: number
  assignees: LeadAssignee[] | undefined
  pending?: boolean
  onAssign: (userId: string) => void
}

export function AssignLeadsDrawer({
  open,
  setOpen,
  layout = 'desktop',
  count,
  assignees,
  pending = false,
  onAssign,
}: AssignLeadsDrawerProps) {
  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) return
    setQuery('')
    setPicked(null)
  }, [open])

  const needle = query.trim().toLowerCase()
  const shown = (assignees ?? []).filter((row) => (row.name ?? '').toLowerCase().includes(needle))
  const nothing = assignees !== undefined && shown.length === 0
  const leads = pluralize(count, 'lead', 'leads')

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      size={layout === 'mobile' ? 'full' : 'sm'}
      label="Assign leads"
    >
      <DrawerHeader title="Assign leads" />
      <DrawerBody>
        <div className="flex flex-col gap-sm">
          <Input
            aria-label="Search employees"
            placeholder="Search employees"
            leading={<Search aria-hidden />}
            value={query}
            disabled={pending}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Text variant="micro" className="text-muted-foreground">
            {`${leads} selected. Pick one employee.`}
          </Text>
          {assignees === undefined ? (
            <div role="status" aria-label="Loading employees" className="flex flex-col gap-xs">
              <Skeleton />
              <Skeleton />
            </div>
          ) : nothing ? (
            <EmptyState
              icon={<Search aria-hidden />}
              title={`No employees match "${query.trim()}"`}
              description="Check the spelling or clear the search."
            />
          ) : (
            <RadioGroup
              aria-label="Employee"
              value={picked ?? ''}
              onValueChange={setPicked}
              disabled={pending}
              className="flex flex-col gap-xs"
            >
              {shown.map((row) => (
                <RadioOption key={row.id} value={row.user_id} showRadio={false}>
                  <span className="flex w-full items-center gap-sm">
                    <Avatar size="sm" fallback={initialsOf(row.name)} />
                    <span className="flex-1 text-small text-foreground">{row.name}</span>
                    <span className="text-micro text-muted-foreground">{`${row.open} open`}</span>
                  </span>
                </RadioOption>
              ))}
            </RadioGroup>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          disabled={picked == null || nothing || pending}
          aria-busy={pending || undefined}
          onClick={() => picked && onAssign(picked)}
        >
          {pending ? (
            <>
              <Spinner size="sm" label="Assigning" />
              Assigning…
            </>
          ) : (
            `Assign ${leads}`
          )}
        </Button>
      </DrawerFooter>
    </Drawer>
  )
}
