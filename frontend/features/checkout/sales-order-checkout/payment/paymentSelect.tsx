import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import type { SalesOrderQuote } from "@dorado/contracts";
import { useEffect } from 'react'
import PriceNumberFlow from '../../../../shared/ui/PriceNumberFlow'

// CREDIT IS NOT A CHOICE (Jacob, 2026-09-03: "No reason to let them make a
// choice"). The server applies a balance whenever one exists; this surface
// shows what the quote applied and drives the CARD/CREDIT method from the
// quote's own numbers. The "Use Bullion Credit?" switch is gone.
export default function PaymentSelect({ orderPrices }: { orderPrices?: SalesOrderQuote }) {
  const { data, setData } = useSalesOrderCheckoutStore()

  useEffect(() => {
    // No quote yet means no decision: defaulting the pair to 0 would read
    // 0 >= 0 and flip the method to CREDIT on first paint.
    if (!orderPrices) return

    const prev = data.payment_method
    const { beginning_funds, base_total } = orderPrices

    let next = prev
    if (beginning_funds >= base_total) {
      next = 'CREDIT'
    } else if (prev === 'CREDIT') {
      next = 'CARD'
    }

    if (next !== prev) {
      setData({ payment_method: next })
    }
  }, [data.payment_method, orderPrices, setData])

  return (
    <>
      {orderPrices && orderPrices.beginning_funds > 0 && (
        <div>
          <p className="eyebrow mb-4">Bullion Credit:</p>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <p>Credit Applied:</p>
              <strong>
                <PriceNumberFlow value={orderPrices.pre_charges_amount} className="tabular-nums" />
              </strong>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <p>Credit Remaining:</p>
              <strong>
                <PriceNumberFlow value={orderPrices.ending_funds} className="tabular-nums" />
              </strong>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
