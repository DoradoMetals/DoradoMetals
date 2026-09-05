import { useCancelPaymentIntent, useOrderPaymentIntent } from '@dorado/client'
import { Amount, Button, Badge, Divider } from '@dorado/components'
import { paymentMethodIcon, SalesOrderDrawerContentProps } from '@/shared/types/salesOrders'
import { usePaymentMethods } from '@dorado/client'

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function AdminPendingSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  const { data: paymentIntent } = useOrderPaymentIntent(order.id)
  const cancelPaymentIntent = useCancelPaymentIntent(order.id)

  // details.type speaks the schema's vocabulary (CARD, ACH), not Stripe's -
  // so the match is on the row's type, where the legacy wire matched its
  // Stripe-spelled value.
  const { data: methods = [] } = usePaymentMethods('sale')
  const paymentType = methods.find((m) => m.type === paymentIntent?.details?.type)
  const Icon = paymentType
    ? paymentMethodIcon[paymentType.type as keyof typeof paymentMethodIcon]
    : undefined
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
        <div className="flex w-full items-center justify-between gap-2">
          <p>Card Brand:</p>
          <strong>{titleCase(paymentIntent.details.card_brand)}</strong>
        </div>
      )}

      {paymentIntent.details?.bank_name && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>Bank Name:</p>
          <strong>{titleCase(paymentIntent.details.bank_name)}</strong>
        </div>
      )}

      {paymentIntent.details?.account_type && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>Account Type:</p>
          <strong>{titleCase(paymentIntent.details.account_type)}</strong>
        </div>
      )}

      {paymentIntent.details?.last_four && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>{paymentType?.type !== 'ACH' ? 'Card Number:' : 'Account Number'}</p>
          <strong>*******{paymentIntent.details.last_four}</strong>
        </div>
      )}
      {/* No routing number, ever. The legacy wire carried one only because
          the exchange read was SELECT *; the contract has no such field,
          and bank details never render outside the admin payout screen. */}
      <Divider />

      {/* DOLLARS on the wire, not cents - the /100 died with the adapter,
          and putting one back here is a hundredfold error on money. */}
      <div className="flex w-full items-center justify-between gap-2">
        <strong>Total Due:</strong>
        <strong className="stat-sm">
          <Amount value={Number(paymentIntent.amount_expected ?? 0)} />
        </strong>
      </div>

      <div className="flex w-full items-center justify-between gap-2">
        <strong>Amount Paid:</strong>
        <strong className="stat-sm">
          <Amount value={Number(paymentIntent.amount_received ?? 0)} />
        </strong>
      </div>

      <div className="flex w-full items-center justify-between gap-2">
        <strong>Remaining Balance:</strong>
        <strong className="stat-sm">
          <Amount
            value={
              Number(paymentIntent.amount_expected ?? 0) -
              Number(paymentIntent.amount_received ?? 0)
            }
          />
        </strong>
      </div>
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
