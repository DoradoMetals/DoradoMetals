'use client'

import * as React from 'react'
import { Autocomplete, Badge, Button, Select, type AutocompleteItem } from '@dorado/components'
import type {
  MatchCandidate,
  OrderViewPayout,
  PayTo,
  PaymentView,
  Rail,
  TransferState,
} from '@dorado/contracts'

import { CardFact, CardHairline, OrderCard } from './OrderCard'
import { DASH, last4, money, when } from './format'

export type PaymentCardProps = {
  payment: PaymentView | null
  payout: OrderViewPayout | null
  payTo: PayTo[]
  rails: Rail[]
  rail: Rail | null
  onRailChange: (rail: Rail) => void
  payToId: string | null
  onPayToChange: (id: string) => void
  candidates: MatchCandidate[]
  matching: boolean
  onStartMatching: () => void
  onConfirmMatch: (inboundId: string) => void
  onSend: () => void
  sendDisabled?: boolean
  sendReason?: string | null
  pending?: boolean
}

const INTENT: Record<TransferState, 'warning' | 'info' | 'success' | 'danger'> = {
  'Not sent': 'warning',
  Due: 'warning',
  Processing: 'info',
  Sent: 'success',
  Received: 'success',
  Failed: 'danger',
}

// The payout direction runs Not sent -> Processing -> Sent; the charge
// direction runs Due -> Processing -> Received. Both states and both labels
// come off `PaymentView`; nothing here decides which phase the money is in.
const PAYOUT_LABEL: Record<TransferState, string> = {
  'Not sent': 'Send payment',
  Due: 'Send payment',
  Processing: 'Processing…',
  Sent: 'Payment sent',
  Received: 'Payment sent',
  Failed: 'Retry payment',
}

const CHARGE_LABEL: Record<TransferState, string> = {
  Due: 'Request payment',
  'Not sent': 'Request payment',
  Processing: 'Processing…',
  Received: 'Payment received',
  Sent: 'Payment received',
  Failed: 'Retry request',
}

export function PaymentCard({
  payment,
  payout,
  payTo,
  rails,
  rail,
  onRailChange,
  payToId,
  onPayToChange,
  candidates,
  matching,
  onStartMatching,
  onConfirmMatch,
  onSend,
  sendDisabled = false,
  sendReason,
  pending = false,
}: PaymentCardProps) {
  const isCharge = payment?.kind === 'charge'
  const state: TransferState = payment?.state ?? (isCharge ? 'Due' : 'Not sent')
  const settled = state === 'Sent' || state === 'Received'
  const label = (isCharge ? CHARGE_LABEL : PAYOUT_LABEL)[state]
  const amount = payment?.amount ?? payment?.amount_due ?? null

  const [chosen, setChosen] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')

  const items: AutocompleteItem[] = candidates.map((candidate) => ({
    id: candidate.id,
    textValue: `${when(candidate.occurred_at)} ${candidate.counterparty_name ?? ''} ${candidate.memo ?? ''}`,
    label: (
      <span className="flex w-full items-center justify-between gap-sm">
        <span className="truncate">
          {when(candidate.occurred_at)} · {candidate.source} · {candidate.counterparty_name ?? DASH}
        </span>
        <span className="shrink-0 font-medium">{money(candidate.amount)}</span>
      </span>
    ),
  }))

  return (
    <OrderCard
      title="Payment"
      summary={money(amount)}
      right={
        <Badge intent={INTENT[state]} variant="soft">
          {state}
        </Badge>
      }
    >
      <div className="flex w-full items-start justify-between gap-md">
        <CardFact label="Account name" value={payout?.account_holder_name ?? DASH} />
        <CardFact label="Bank" value={payout?.bank_name ?? payment?.pay_to?.bank_name ?? DASH} />
        <CardFact label="Account type" value={payout?.account_type ?? DASH} />
        <CardFact label="Routing" value={last4(payout?.routing_last4)} />
        <CardFact
          label="Account"
          value={last4(payout?.account_last4 ?? payment?.pay_to?.last_four ?? null)}
        />
        <CardFact label="Amount" value={money(amount)} align="end" />
      </div>

      <CardHairline />

      {matching ? (
        <div className="flex w-full items-end gap-md">
          <Autocomplete
            label="Unmatched inbound transactions"
            value={query}
            onValueChange={(value) => {
              setQuery(value)
              setChosen(null)
            }}
            items={items}
            onSelect={(item) => {
              setChosen(item.id)
              setQuery(item.textValue)
            }}
            placeholder="Search the bank feed…"
            empty="Nothing unmatched looks like this order."
            className="flex-1"
          />
          <Button
            variant={chosen ? 'primary' : 'secondary'}
            size="lg"
            disabled={!chosen || pending}
            onClick={() => chosen && onConfirmMatch(chosen)}
          >
            Confirm match
          </Button>
        </div>
      ) : (
        <div className="flex w-full items-end gap-md">
          <Select
            label="Method"
            className="flex-1"
            items={rails.map((one) => ({ value: one, label: one.replace(/_/g, ' ') }))}
            value={rail ?? undefined}
            onValueChange={(value) => onRailChange(value as Rail)}
            disabled={settled}
            placeholder="Choose a rail"
          />
          {!isCharge && (
            <Select
              label="Pay to"
              className="flex-1"
              items={payTo.map((account) => ({
                value: account.id,
                label: `${account.bank_name ?? DASH} · ${last4(account.last_four)}`,
              }))}
              value={payToId ?? undefined}
              onValueChange={onPayToChange}
              disabled={settled}
              placeholder="The payee's account"
            />
          )}
          <Button
            variant="primary"
            size="lg"
            className="w-[280px]"
            disabled={sendDisabled || settled || state === 'Processing' || pending}
            onClick={isCharge && state !== 'Due' ? onStartMatching : onSend}
          >
            {label}
          </Button>
          {isCharge && !settled && (
            <Button variant="secondary" size="lg" onClick={onStartMatching}>
              Mark received
            </Button>
          )}
        </div>
      )}

      {sendReason && !settled && (
        <p className="text-micro text-muted-foreground">{sendReason}</p>
      )}
      {payment?.failure_reason && (
        <p className="text-micro text-destructive">{payment.failure_reason}</p>
      )}
      {payment?.reference && (
        <p className="text-micro text-muted-foreground">Reference {payment.reference}</p>
      )}
    </OrderCard>
  )
}
