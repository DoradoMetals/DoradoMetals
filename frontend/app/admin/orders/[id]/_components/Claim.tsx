import * as React from 'react'
import type { ClaimStatus, ShipmentClaimView } from '@dorado/contracts'
import { Badge, type BadgeProps } from '@dorado/components'

import { formatStamp } from '@/shared/utils/formatStamp'
import { formatTotal } from '../../_lib'
import { Facts } from './Facts'
import { OrderSection, type SectionContent } from './OrderSection'

export type ClaimOutcome = ClaimStatus

export type ClaimProps = {
  claim: ShipmentClaimView | null
  trackingNumber?: string | null
  carrier?: string | null
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onRetry?: () => void
}

const intents: Record<ClaimOutcome, NonNullable<BadgeProps>['intent']> = {
  Pending: 'warning',
  Paid: 'success',
  Denied: 'danger',
}

export function Claim({
  claim,
  trackingNumber,
  carrier: carrierName,
  layout = 'desktop',
  content = 'loaded',
  open,
  onOpenChange,
  onRetry,
}: ClaimProps) {
  const shown: SectionContent = content === 'loaded' && !claim ? 'empty' : content
  const carrier = carrierName ? `${carrierName} ` : ''
  return (
    <OrderSection
      title="Claim"
      layout={layout}
      content={shown}
      open={open}
      onOpenChange={onOpenChange}
      onRetry={onRetry}
      badge={
        claim ? (
          <Badge intent={intents[claim.status]} variant="soft">
            {claim.status}
          </Badge>
        ) : undefined
      }
      emptyTitle="No claim"
      emptyDescription="A claim on a lost or damaged parcel shows here."
    >
      {claim && (
        <>
          <Facts
            layout={layout}
            className={
              layout === 'mobile' ? 'grid-cols-1 [&>div]:items-start [&>div]:text-left' : undefined
            }
            facts={[
              { label: 'Filed', value: formatStamp(claim.created_at) },
              {
                label: 'Carrier claim',
                value: claim.carrier_claim_number ? `${carrier}${claim.carrier_claim_number}` : '—',
              },
              {
                label: 'Shipment',
                value: trackingNumber ? `${carrier}${trackingNumber}` : '—',
              },
              {
                label: 'Amount',
                value: formatTotal(
                  claim.status === 'Paid' && claim.paid_amount != null
                    ? claim.paid_amount
                    : claim.amount
                ),
              },
            ]}
          />
          {claim.note && <p className="text-micro text-muted-foreground">{claim.note}</p>}
        </>
      )}
    </OrderSection>
  )
}
