import { useCancelPaymentIntent, useGetSalesOrderPaymentIntent } from '@/features/stripe/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import StatusChip from '@/shared/ui/StatusChip'
import { Separator } from '@/shared/ui/base/separator'
import { DetailRow } from '@/shared/ui/DetailRow'
import { paymentOptions, SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function AdminPendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: paymentIntent } = useGetSalesOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent(order.id)

  // details.type speaks the schema's vocabulary (CARD, ACH), not Stripe's -
  // so the match is on the option's method, where the legacy wire matched its
  // Stripe-spelled value.
  const paymentType = paymentOptions.find((p) => p.method === paymentIntent?.details?.type)
  const Icon = paymentType?.icon
  // The provider's reference lives on the attempt, and is what cancel takes.
  const intentRef = paymentIntent?.attempt?.provider_ref ?? null

  if (!paymentIntent) return null

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border h-full p-4">
      <div className="flex items-center w-full justify-between">
        <strong className="flex items-center gap-2">
          {Icon && <Icon size={24} />}
          {paymentType?.label}
        </strong>
        {/* The three hand-rolled `*-on-glass` pills were a StatusChip all
            along - same tint, same hairline, one vocabulary (ruling 25). */}
        <StatusChip
          tone={
            paymentIntent.status === 'succeeded'
              ? 'success'
              : paymentIntent.status === 'processing'
              ? 'info'
              : 'danger'
          }
        >
          {paymentIntent.status === 'requires_payment_method'
            ? 'Failed'
            : titleCase(paymentIntent.status ?? '')}
        </StatusChip>
      </div>

      <Separator />

      {paymentIntent.details?.card_brand && (
        <DetailRow label="Card Brand:">{titleCase(paymentIntent.details.card_brand)}</DetailRow>
      )}

      {paymentIntent.details?.bank_name && (
        <DetailRow label="Bank Name:">{titleCase(paymentIntent.details.bank_name)}</DetailRow>
      )}

      {paymentIntent.details?.account_type && (
        <DetailRow label="Account Type:">{titleCase(paymentIntent.details.account_type)}</DetailRow>
      )}

      {paymentIntent.details?.last_four && (
        <DetailRow label={paymentType?.method !== 'ACH' ? 'Card Number:' : 'Account Number'}>
          *******{paymentIntent.details.last_four}
        </DetailRow>
      )}
      {/* No routing number, ever. The legacy wire carried one only because
          the exchange read was SELECT *; the contract has no such field,
          and bank details never render outside the admin payout screen. */}
      <Separator />

      {/* DOLLARS on the wire, not cents - the /100 died with the adapter,
          and putting one back here is a hundredfold error on money. */}
      <DetailRow label="Total Due:" total>
        <PriceNumberFlow value={Number(paymentIntent.amount_expected ?? 0)} />
      </DetailRow>

      <DetailRow label="Amount Paid:" total>
        <PriceNumberFlow value={Number(paymentIntent.amount_received ?? 0)} />
      </DetailRow>

      <DetailRow label="Remaining Balance:" total>
        <PriceNumberFlow
          value={
            Number(paymentIntent.amount_expected ?? 0) -
            Number(paymentIntent.amount_received ?? 0)
          }
        />
      </DetailRow>
      <Separator />
      <Button
        variant="secondary"
        onClick={() => intentRef && cancelPaymentIntent.mutate(intentRef)}
        disabled={
          !intentRef ||
          cancelPaymentIntent.isPending ||
          ['canceled', 'succeeded', 'processing'].includes(paymentIntent.status ?? '')
        }
      >
        {cancelPaymentIntent.isPending ? 'Cancelling...' : 'Cancel Payment'}
      </Button>
    </div>
  )
}
