import { useRates } from '@/features/rates/queries'
import { pctLabel, topRatesByMetal } from '@/features/rates/types'
import { Metal } from '@/features/spots/types'
import { Button } from '@/shared/ui/base/button'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

export function Rates() {
  const { data: rates = [] } = useRates()
  const router = useRouter()
  const top4 = useMemo(() => topRatesByMetal(rates), [rates])

  return (
    <>
      <section aria-label="Our Current Rates" className="w-full flex flex-col">
        <div
          className="
              bg-primary
              px-6
              pt-4 pb-16 sm:pt-8 sm:pb-34 lg:pt-10 lg:pb-44
              [clip-path:polygon(0_0,100%_0,100%_100%,50%_60%,0_100%)]
              sm:[clip-path:polygon(0_0,100%_0,100%_100%,50%_40%,0_100%)]
            "
        >
          <h2 className="text-center text-white font-semibold tracking-wide text-lg sm:text-2xl">
            Get the highest rates for your precious metals
          </h2>
        </div>
        <div className="flex items-center justify-center -mt-2 sm:-mt-12 w-full mb-8 md:mb-12">
          <div className="flex flex-col items-center w-full max-w-6xl gap-4 md:gap-6">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-8 w-full max-w-5xl">
              {top4.map((r, i) => {
                const metal = ['Gold', 'Silver', 'Platinum', 'Palladium'][i] as Metal
                const value = r
                  ? Math.max(r.scrap_pct ?? -Infinity, r.bullion_pct ?? -Infinity)
                  : null
                return (
                  <div key={metal} className="flex justify-center">
                    <div className="flex flex-col items-start">
                      <p className="text-base text-neutral-700 pl-1 tracking-wide font-normal">
                        Up to
                      </p>
                      <dt className="sr-only">{metal} payout</dt>
                      <dd className="text-5xl sm:text-6xl font-bold text-neutral-900">
                        {pctLabel(value)}
                      </dd>
                      <p className="text-base text-neutral-700 pl-1 tracking-wide font-normal">
                        on {metal}
                      </p>
                    </div>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
        <p className="text-center text-neutral-600 text-sm md:text-lg max-w-2xl mx-auto mb-8 md:mb-12 px-4">
          We buy at rates you won't find anywhere else. Skip the local pawn shop or jewelry store—
          you deserve a fair market value for your metals.
        </p>
        <div className="flex justify-center -mb-5">
          <Button
            className="bg-highest raised-off-page px-6 sm:px-8 py-5 text-white text-lg z-1 text-primary hover:text-white hover:bg-primary"
            onClick={() => router.push('/rates')}
          >
            View Full Rates
          </Button>
        </div>

        <div className="h-12 bg-primary" />
      </section>
    </>
  )
}
