'use client'

import NextLink from 'next/link'
import * as React from 'react'
import {
  Badge,
  Breadcrumb,
  Button,
  EntityHeader,
  Select,
  Text,
  type SelectItemShape,
} from '@dorado/components'
import type { LeadView } from '@dorado/contracts'

import { protectedRoutes } from '@/shared/types/routes'

import { BADGE_INTENT, formatShortDate, leadBadge } from '../../_lib'

const NOBODY = 'nobody'

export type LeadHeaderProps = {
  layout?: 'desktop' | 'mobile'
  lead: LeadView
  assignees: SelectItemShape[]
  onAssign: (userId: string | null) => void
  onConvert: () => void
  onDelete: () => void
  onRestore: () => void
  pending?: boolean
}

export function LeadHeader({
  layout = 'desktop',
  lead,
  assignees,
  onAssign,
  onConvert,
  onDelete,
  onRestore,
  pending = false,
}: LeadHeaderProps) {
  const badge = leadBadge(lead)
  const archived = badge === 'Archived'
  return (
    <div data-testid="lead-header">
      <EntityHeader
        layout={layout}
        breadcrumb={
          <Breadcrumb
            linkComponent={NextLink}
            items={[
              { label: 'Admin', href: protectedRoutes.admin.path },
              { label: 'Leads', href: protectedRoutes.adminLeads.path },
              { label: lead.name },
            ]}
          />
        }
        eyebrow="LEAD"
        badge={
          <Badge variant="soft" intent={BADGE_INTENT[badge]}>
            {badge}
          </Badge>
        }
        identity={
          <Text variant="h2" as="h1">
            {lead.name}
          </Text>
        }
        reference={lead.number}
        meta={`Created ${formatShortDate(lead.created_at)}`}
        assignedTo={
          <Select
            label="Assigned to"
            items={[{ value: NOBODY, label: 'Unowned' }, ...assignees]}
            value={lead.assigned_to_id ?? NOBODY}
            onValueChange={(value) => onAssign(value === NOBODY ? null : value)}
          />
        }
        buttons={
          <>
            <Button
              variant="primary"
              disabled={archived || lead.converted_at != null || pending}
              onClick={onConvert}
            >
              Convert
            </Button>
            {archived ? (
              <Button variant="secondary" disabled={pending} onClick={onRestore}>
                Restore
              </Button>
            ) : (
              <Button variant="secondary" intent="danger" disabled={pending} onClick={onDelete}>
                Delete
              </Button>
            )}
          </>
        }
      />
    </div>
  )
}
