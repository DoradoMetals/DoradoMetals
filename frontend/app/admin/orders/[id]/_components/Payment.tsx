'use client'

import * as React from 'react'
import type {
  Action,
  OrderPaymentFacts,
  OrderPaymentView,
  OrderViewPayout,
} from '@dorado/contracts'
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Divider,
  type AutocompleteItem,
  type BadgeProps,
  type SelectItemShape,
} from '@dorado/components'
import { Plus, Search } from '@dorado/icons'

import { formatTotal } from '../../_lib'
import type { OfferedAction } from '../../_components/OrderActionButtons'
import { Facts, type Fact } from './Facts'
import { OrderSection, type SectionContent } from './OrderSection'
import { PayoutLines, type PayoutLine, type PayoutLinePatch } from './PayoutLines'

export const BALANCE_METHOD = 'DORADO_ACCOUNT'

export type MatchCandidate = { id: string; label: string; muted?: boolean }

export type PaymentProps = {
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onRetry?: () => void
  payment: OrderPaymentView | null
  paymentFacts?: OrderPaymentFacts | null
  payout?: OrderViewPayout | null
  methods: SelectItemShape[]
  lines: PayoutLine[]
  onLineChange?: (index: number, patch: PayoutLinePatch) => void
  onAddLine?: () => void
  actions: OfferedAction[]
  onAction: (action: Action) => void
  onLinkBank?: () => void
  pending?: string | null
  matching?: {
    query: string
    onQueryChange: (query: string) => void
    candidates: MatchCandidate[]
    selectedId: string | null
    onSelect: (id: string) => void
  }
}

type Intent = NonNullable<BadgeProps>['intent']

const badgeIntent = (label: string): Intent => {
  if (label === 'Failed' || label === 'Declined') return 'danger'
  if (label === 'Sent' || label === 'Received') return 'success'
  if (label === 'Processing') return 'info'
  return 'warning'
}

const statusButton: Record<string, string> = {
  Processing: 'Processing…',
  Sent: 'Payment sent',
  Received: 'Payment received',
}

const dots = (last4: string | null | undefined) => (last4 ? `•••• ${last4}` : null)

export function Payment({
  layout = 'desktop',
  content = 'loaded',
  open,
  onOpenChange,
  onRetry,
  payment,
  paymentFacts = null,
  payout = null,
  methods,
  lines,
  onLineChange,
  onAddLine,
  actions,
  onAction,
  onLinkBank,
  pending = null,
  matching,
}: PaymentProps) {
  const mobile = layout === 'mobile'
  const sale = payment?.direction === 'sale'
  const card = payment?.rail === 'CARD' || payment?.card_last4 != null
  const failed = payment?.state === 'Failed'
  const declined = card && (failed || payment?.intent_status === 'requires_payment_method')
  const balance = lines.length === 1 && lines[0].method === BALANCE_METHOD
  const noBank = !sale && !balance && lines.every((line) => (line.payTo ?? []).length === 0)
  const split = lines.length > 1
  const refunded = paymentFacts != null && paymentFacts.refunded > 0
  const label = declined
    ? 'Declined'
    : refunded
      ? 'Partially refunded'
      : (payment?.state ?? 'Not sent')

  const accountFacts: Fact[] =
    sale && card
      ? [
          {
            label: 'Card',
            value: [payment?.card_brand, dots(payment?.card_last4)].filter(Boolean).join(' '),
          },
        ]
      : balance || noBank
        ? [{ label: 'Account name', value: payout?.account_holder_name }]
        : [
            { label: 'Account name', value: payout?.account_holder_name },
            { label: 'Bank', value: payout?.bank_name },
            { label: 'Account type', value: payout?.account_type },
            { label: 'Routing', value: dots(payout?.routing_last4) },
            { label: 'Account', value: dots(payout?.account_last4) },
          ]
  const facts: Fact[] = [
    ...accountFacts,
    {
      label: 'Amount',
      value: payment?.amount_due != null ? formatTotal(payment.amount_due) : null,
    },
    ...(refunded ? [{ label: 'Refunded', value: formatTotal(paymentFacts!.refunded) }] : []),
  ]

  const has = (name: string) => actions.find((action) => action.name === name)
  const primaryName = balance ? 'add_funds' : sale ? 'request_payment' : 'send_payment'
  const primaryAction = has(primaryName)
  const primaryLabel = balance
    ? 'Credit balance'
    : sale
      ? 'Request payment'
      : failed
        ? 'Retry payout'
        : 'Send payment'
  const idleLabel = payment?.state ? statusButton[payment.state] : undefined
  const primary = primaryAction ? (
    <Button
      size="lg"
      disabled={pending === primaryAction.name || primaryAction.enabled === false}
      className={mobile ? 'w-full' : 'flex-[3]'}
      onClick={() => onAction(primaryAction)}
    >
      {primaryLabel}
    </Button>
  ) : (
    <Button size="lg" disabled className={mobile ? 'w-full' : 'flex-[3]'}>
      {idleLabel ?? primaryLabel}
    </Button>
  )
  const linkBank =
    noBank && onLinkBank ? (
      <Button
        variant="secondary"
        size="lg"
        className={mobile ? 'w-full' : undefined}
        onClick={onLinkBank}
      >
        Link bank account
      </Button>
    ) : null
  const addLine =
    !sale && !balance && onAddLine && primaryAction ? (
      <Button
        variant="tertiary"
        icon={Plus}
        iconPlacement="left"
        className="self-start"
        onClick={onAddLine}
      >
        Add payout method
      </Button>
    ) : null
  const confirmMatch = has('confirm_match')

  return (
    <OrderSection
      title="Payment"
      layout={layout}
      content={content}
      open={open}
      onOpenChange={onOpenChange}
      onRetry={onRetry}
      badge={
        <Badge intent={badgeIntent(label)} variant="soft">
          {label}
        </Badge>
      }
      emptyTitle="No payout account yet"
      emptyDescription="Add the customer’s bank account, or pay this order in store credit."
    >
      <Facts facts={facts} layout={layout} />
      {failed && !card && (
        <Alert intent="danger" title="The bank returned this payout">
          {payment?.failure_reason}
        </Alert>
      )}
      {declined && (
        <Alert intent="danger" title="Card declined">
          {[
            [payment?.card_brand, dots(payment?.card_last4)].filter(Boolean).join(' '),
            payment?.failure_reason,
          ]
            .filter(Boolean)
            .join(': ')}
        </Alert>
      )}
      {balance && (
        <Alert intent="info" title="Paid to the customer’s Dorado balance">
          No bank account is needed. The credit is available on their next sale.
        </Alert>
      )}
      {noBank && (
        <Alert intent="warning" title="No bank account linked">
          Link the customer’s bank, or pay to their Dorado balance.
        </Alert>
      )}
      <Divider />
      {matching ? (
        <div className={mobile ? 'flex flex-col gap-sm' : 'flex items-start gap-md'}>
          <Autocomplete
            value={matching.query}
            onValueChange={matching.onQueryChange}
            placeholder="Search unmatched transactions…"
            leading={<Search aria-hidden className="size-4" />}
            items={matching.candidates.map((candidate): AutocompleteItem => ({
              id: candidate.id,
              textValue: candidate.label,
              label: candidate.label,
            }))}
            onSelect={(item) => matching.onSelect(item.id)}
            className="flex-1"
          />
          {confirmMatch && (
            <Button
              variant="secondary"
              size="lg"
              disabled={matching.selectedId == null || pending === confirmMatch.name}
              className={mobile ? 'w-full' : undefined}
              onClick={() => onAction(confirmMatch)}
            >
              Confirm match
            </Button>
          )}
        </div>
      ) : split ? (
        <>
          <PayoutLines
            lines={lines}
            methods={methods}
            layout={layout}
            onLineChange={onLineChange}
          />
          <div
            className={mobile ? 'flex flex-col gap-sm' : 'flex items-center justify-between gap-md'}
          >
            {addLine}
            <div className={mobile ? 'contents' : 'flex w-[17.5rem]'}>{primary}</div>
          </div>
        </>
      ) : (
        <>
          <PayoutLines
            lines={lines}
            methods={methods}
            layout={layout}
            showPayTo={!sale && !balance}
            onLineChange={onLineChange}
            trailing={
              mobile ? undefined : (
                <>
                  {linkBank}
                  {primary}
                </>
              )
            }
          />
          {mobile && (
            <>
              {linkBank}
              {primary}
            </>
          )}
          {addLine}
        </>
      )}
    </OrderSection>
  )
}
