'use client'

import { usePaymentMethods } from '@dorado/client'
import { PayoutCard } from './_src_/ui/PayoutCard'

export default function Page() {
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  return (
    <main className="relative w-full flex flex-col items-center">
      <section className="w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-4">
        <div className="max-w-4xl flex flex-col gap-3 items-start justify-start">
          <h1>Payout Methods</h1>
          <p>
            Choose how you'd like to get paid when you sell your metal. We offer several secure
            payout options designed to balance speed, convenience, and flexibility. Each method
            below explains how it works, typical timing, and when it might be the best fit.
          </p>
        </div>
      </section>

      <section className="w-full px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="flex flex-col gap-6 sm:gap-8">
          {payoutMethods.map((option) => (
            <PayoutCard key={option.type} method={option} />
          ))}
        </div>
      </section>
    </main>
  )
}
