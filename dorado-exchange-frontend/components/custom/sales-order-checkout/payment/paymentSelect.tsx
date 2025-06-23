import { Switch } from '@/components/ui/switch'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import { SalesOrderTotals } from '@/types/sales-orders'
import { useEffect } from 'react'
import PriceNumberFlow from '../../products/PriceNumberFlow'

export default function PaymentSelect({ orderPrices }: { orderPrices: SalesOrderTotals }) {
  const { data, setData } = useSalesOrderCheckoutStore()

  const handleFundsToggle = (checked: boolean) => {
    setData({
      using_funds: checked,
    })
  }

  useEffect(() => {
    const funds = orderPrices.beginningFunds ?? 0
    const hasFunds = funds > 0

    const nextUsingFunds = hasFunds && data.using_funds

    const nextMethod = nextUsingFunds
      ? orderPrices.baseTotal > funds
        ? 'CARD_AND_FUNDS'
        : 'FUNDS'
      : 'CARD'

    if (data.using_funds !== nextUsingFunds || data.payment_method !== nextMethod) {
      setData({
        using_funds: nextUsingFunds,
        payment_method: nextMethod,
      })
    }
  }, [
    orderPrices.baseTotal,
    orderPrices.beginningFunds,
    data.using_funds,
    data.payment_method,
    setData,
  ])

  return (
    <>
      {orderPrices.beginningFunds > 0 && (
        <div className="">
          <div className="text-xs text-neutral-600 uppercase tracking-widest mb-4">Payment Method:</div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <div className="text-sm text-neutral-700">Use Bullion Credit?</div>
              <Switch
                checked={data.using_funds}
                onCheckedChange={handleFundsToggle}
                disabled={orderPrices.beginningFunds <= 0}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <div className="text-sm text-neutral-700">Credit Available:</div>
              <div className="text-lg text-neutral-900">
                <PriceNumberFlow value={orderPrices.beginningFunds} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
