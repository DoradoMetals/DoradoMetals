import type { SaleQuote } from '@dorado/contracts'
import { Amount } from '@dorado/components'

// CREDIT IS NOT A CHOICE (ruling 47: "No reason to let them make a choice").
// The server applies a balance whenever one exists; this surface only shows
// what the quote applied.
//
// The effect that used to flip `payment_method` between CARD and CREDIT is
// gone: it wrote a store field from the quote's own numbers, which the caller
// can read directly - `beginning_funds >= base_total` is one expression, in
// salesOrderCheckout.tsx, where the decision is used.
export default function PaymentSelect({ orderPrices }: { orderPrices?: SaleQuote }) {
  if (!orderPrices || orderPrices.beginning_funds <= 0) return null

  return (
    <div>
      <p className="eyebrow mb-4">Bullion Credit:</p>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 items-start">
          <p>Credit Applied:</p>
          <strong>
            <Amount value={orderPrices.pre_charges_amount} />
          </strong>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <p>Credit Remaining:</p>
          <strong>
            <Amount value={orderPrices.ending_funds} />
          </strong>
        </div>
      </div>
    </div>
  )
}
