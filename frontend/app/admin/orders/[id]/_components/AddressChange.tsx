'use client'

import * as React from 'react'
import { Button, Select, Textarea, type SelectItemShape } from '@dorado/components'
import type { Action } from '@dorado/contracts'

import { OrderSection, type SectionContent } from './OrderSection'

export const ADDRESS_REASON_MIN = 10

export type AddressChangeProps = {
  addresses: SelectItemShape[]
  currentId: string | null
  action: Action | undefined
  layout?: 'desktop' | 'mobile'
  content?: Exclude<SectionContent, 'empty'>
  pending?: boolean
  onRetry?: () => void
  onChange: (input: { address_id: string; reason: string }) => void
  defaultOpen?: boolean
}

export function AddressChange({
  addresses,
  currentId,
  action,
  layout = 'desktop',
  content = 'loaded',
  pending = false,
  onRetry,
  onChange,
  defaultOpen = false,
}: AddressChangeProps) {
  const mobile = layout === 'mobile'
  const [addressId, setAddressId] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const choices = addresses.filter((item) => item.value !== currentId)
  const ready =
    action != null && !pending && addressId != null && reason.trim().length >= ADDRESS_REASON_MIN
  return (
    <OrderSection
      title="Address change"
      layout={layout}
      content={content === 'loaded' && choices.length === 0 ? 'empty' : content}
      emptyTitle="No other address on file"
      emptyDescription="Add an address to the customer’s address book first."
      errorTitle="Couldn’t load the address book"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      <Select
        label="New ship-to address"
        placeholder="Choose an address"
        items={choices}
        value={addressId ?? undefined}
        disabled={action == null}
        onValueChange={setAddressId}
      />
      <Textarea
        label="Reason"
        placeholder="Why the address changes (10 characters or more)"
        value={reason}
        disabled={action == null}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        variant="secondary"
        className={mobile ? 'w-full' : 'self-end'}
        disabled={!ready}
        onClick={() => addressId && onChange({ address_id: addressId, reason: reason.trim() })}
      >
        Change address
      </Button>
    </OrderSection>
  )
}
