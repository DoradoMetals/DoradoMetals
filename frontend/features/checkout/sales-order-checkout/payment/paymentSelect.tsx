import { Switch } from '@dorado/components'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import type { SalesOrderQuote } from '@dorado/contracts'
import { useEffect } from 'react'
import PriceNumberFlow from '../../../../shared/ui/PriceNumberFlow'

export default function PaymentSelect({ orderPrices }: { orderPrices?: SalesOrderQuote }) {
  const { data, setData } = useSalesOrderCheckoutStore()

  const handleFundsToggle = (checked: boolean) => {
    setData({
      using_funds: checked,
    })
  }

  useEffect(() => {
    // No quote yet means no decision: defaulting the pair to 0 would read
    // 0 >= 0 and flip the method to CREDIT on first paint.
    if (!orderPrices) return

    const usingFunds = !!data.using_funds
    const prev = data.payment_method
    const { beginning_funds, base_total } = orderPrices

    let next = prev

    if (usingFunds) {
      if (beginning_funds >= base_total) {
        next = 'CREDIT'
      } else if (prev === 'CREDIT') {
        next = 'CARD'
      }
    } else {
      if (prev === 'CREDIT') next = 'CARD'
    }

    if (next !== prev) {
      setData({ payment_method: next })
    }
  }, [
    data.using_funds,
    data.payment_method,
    orderPrices,
    setData,
  ])

  return (
    <>
      {orderPrices && orderPrices.beginning_funds > 0 && (
        <div>
          <p className="eyebrow mb-4">Payment Method:</p>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <p>Use Bullion Credit?</p>
              <Switch
                checked={data.using_funds}
                onCheckedChange={handleFundsToggle}
                disabled={orderPrices.beginning_funds <= 0}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <p>Credit Available:</p>
              <strong>
                <PriceNumberFlow value={orderPrices.beginning_funds} />
              </strong>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
