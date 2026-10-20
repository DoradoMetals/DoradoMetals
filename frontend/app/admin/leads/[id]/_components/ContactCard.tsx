'use client'

import * as React from 'react'
import { Button, Input } from '@dorado/components'
import type { LeadView } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

import { DASH, formatConsent } from '../../_lib'
import { LeadSection } from './LeadSection'

export type ContactCardProps = {
  lead: LeadView
  preference: string | null
  onEdit: () => void
}

export function ContactCard({ lead, preference, onEdit }: ContactCardProps) {
  return (
    <LeadSection
      name="contact"
      title="Contact info"
      actions={
        <Button variant="tertiary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <Input label="Phone" readOnly value={lead.phone ? formatPhoneNumber(lead.phone) : DASH} />
      <Input label="Email" readOnly value={lead.email ?? DASH} />
      <Input label="Preference" readOnly value={preference ?? DASH} />
      <Input label="Last contacted" readOnly value={formatStamp(lead.last_contacted)} />
      <Input label="Texts" readOnly value={formatConsent(lead)} />
    </LeadSection>
  )
}
