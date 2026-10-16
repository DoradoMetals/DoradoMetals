'use client'

import { Badge, type BadgeProps } from '@dorado/components'
import type { PaymentView, SettlementType, TransferState } from '@dorado/contracts'

import { DASH, formatMoney, lastFour } from '../_lib'
import { FigureField } from './FigureRow'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

const INTENTS: Record<TransferState, NonNullable<BadgeProps>['intent']> = {
  'Not sent': 'warning',
  Due: 'warning',
  Processing: 'info',
  Sent: 'success',
  Received: 'success',
  Failed: 'danger',
}

export type RefinerPaymentProps = {
  payment: PaymentView | null
  settlementType: SettlementType
  direction: 'sell' | 'buy'
  content?: RefinerCardContent
  layout?: 'desktop' | 'mobile'
  onRetry?: () => void
}

export function RefinerPayment({
  payment,
  settlementType,
  direction,
  content = 'loaded',
  layout = 'desktop',
  onRetry,
}: RefinerPaymentProps) {
  const pooled = direction === 'sell' && settlementType === 'pooled'
  const shown: RefinerCardContent =
    content === 'loaded' && payment === null && !pooled ? 'empty' : content

  return (
    <section aria-label="Payment" data-layout={layout}>
      <RefinerCardShell
        label="Payment"
        content={shown}
        actions={
          pooled && payment === null ? (
            <Badge intent="info" variant="soft">
              Pooled
            </Badge>
          ) : payment?.state ? (
            <Badge intent={INTENTS[payment.state]} variant="soft">
              {payment.state}
            </Badge>
          ) : undefined
        }
        emptyTitle="No payment yet"
        emptyDescription={
          direction === 'sell'
            ? 'The refiner’s payment shows here once the order settles.'
            : 'Our payment to the refiner shows here once it is opened.'
        }
        errorTitle="Couldn’t load payment"
        onRetry={onRetry}
      >
        {payment === null ? (
          <FigureField label="Settlement" value="Pooled · no payment due" />
        ) : (
          <div
            className={layout === 'mobile' ? 'grid grid-cols-2 gap-md' : 'grid grid-cols-5 gap-md'}
          >
            <FigureField label="Account name" value={payment.pay_to?.holder_name ?? DASH} />
            <FigureField
              label="Bank"
              value={payment.payout_account?.bank_name ?? payment.pay_to?.bank_name ?? DASH}
            />
            <FigureField
              label="Account type"
              value={payment.payout_account?.account_type ?? DASH}
            />
            <FigureField
              label="Account"
              value={lastFour(payment.payout_account?.last_four ?? payment.pay_to?.last_four)}
            />
            <FigureField label="Amount" value={formatMoney(payment.amount_due)} />
            {direction === 'buy' ? (
              <>
                <FigureField
                  label="Method"
                  value={payment.payout_account?.method ?? payment.rail ?? DASH}
                />
                <FigureField
                  label="Pay to"
                  value={
                    payment.pay_to
                      ? [payment.pay_to.bank_name, lastFour(payment.pay_to.last_four)]
                          .filter(Boolean)
                          .join(' · ')
                      : DASH
                  }
                />
              </>
            ) : null}
          </div>
        )}
      </RefinerCardShell>
    </section>
  )
}
