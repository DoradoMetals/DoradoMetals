'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'
import { useMemo } from 'react'

import { formatFullDate } from '@/utils/dateFormatting'

import { Lead } from '@/types/leads'

export default function LeadsDrawer({ leads, lead_id }: { leads: Lead[]; lead_id: string }) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'leads'

  const lead = useMemo(() => leads.find((u) => u.id === lead_id), [leads, lead_id])

  if (!lead) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col flex-1 h-full space-y-4 p-5 overflow-y-scroll sm:overflow-y-auto pb-30 sm:pb-5 bg-background w-full">
        <div className="flex items-center justify-between w-full">
          <div className="text-xl text-neutral-900">{lead.name}</div>
          <div className="text-base text-neutral-800">{formatFullDate(lead.created_at)}</div>
        </div>

        <div className="separator-inset" />
      </div>
    </Drawer>
  )
}
