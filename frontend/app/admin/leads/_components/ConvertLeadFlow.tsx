'use client'

import * as React from 'react'
import { useConvertLead, useEstimateItems, useLeadEstimate } from '@dorado/client'
import type { LeadView } from '@dorado/contracts'

import { ConvertDialog } from './ConvertDialog'

export type ConvertLeadFlowProps = {
  lead: LeadView
  onDone: () => void
}

export function ConvertLeadFlow({ lead, onDone }: ConvertLeadFlowProps) {
  const items = useEstimateItems(lead.id).data ?? []
  const estimate = useLeadEstimate(lead.id, { enabled: items.length > 0 }).data
  const convert = useConvertLead(lead.id)

  return (
    <ConvertDialog
      open
      lead={lead}
      itemCount={items.length}
      estimateTotal={estimate?.total ?? null}
      pending={convert.isPending}
      error={convert.error ? convert.error.message : null}
      onCancel={onDone}
      onConvert={(body) => convert.mutate(body, { onSuccess: onDone })}
    />
  )
}
