import { useCancelPaymentIntent, useGetSalesOrderPaymentIntent } from '@/features/stripe/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button, Badge, Divider } from '@dorado/components'
import { DetailRow } from '@/shared/ui/DetailRow'
import { paymentMethodIcon, SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'
import { usePaymentMethods } from '@/features/payments/queries'

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function AdminPendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: paymentIntent } = useGetSalesOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent(order.id)

  // details.type speaks the schema's vocabulary (CARD, ACH), not Stripe's -
  // so the match is on the row's type, where the legacy wire matched its
  // Stripe-spelled value.
  const { data: methods = [] } = usePaymentMethods('sale')
  const paymentType = methods.find((m) => m.type === paymentIntent?.details?.type)
  const Icon = paymentType ? paymentMethodIcon[paymentType.type as keyof typeof paymentMethodIcon] : undefined
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
        <Badge
          intent={
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
        </Badge>
      </div>

      <Divider />

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
        <DetailRow label={paymentType?.type !== 'ACH' ? 'Card Number:' : 'Account Number'}>
          *******{paymentIntent.details.last_four}
        </DetailRow>
      )}
      {/* No routing number, ever. The legacy wire carried one only because
          the exchange read was SELECT *; the contract has no such field,
          and bank details never render outside the admin payout screen. */}
      <Divider />

      {/* DOLLARS on the wire, not cents - the /100 died with the adapter,
          and putting one back here is a hundredfold error on money. */}
      <DetailRow label="Total Due:" variant="total">
        <PriceNumberFlow value={Number(paymentIntent.amount_expected ?? 0)} />
      </DetailRow>

      <DetailRow label="Amount Paid:" variant="total">
        <PriceNumberFlow value={Number(paymentIntent.amount_received ?? 0)} />
      </DetailRow>

      <DetailRow label="Remaining Balance:" variant="total">
        <PriceNumberFlow
          value={
            Number(paymentIntent.amount_expected ?? 0) -
            Number(paymentIntent.amount_received ?? 0)
          }
        />
      </DetailRow>
      <Divider />
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
