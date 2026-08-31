import { useRates } from '@/features/rates/queries'
import { pctLabel, topRatesByMetal } from '@/features/rates/types'
import { Metal } from '@/features/spots/types'
import { Button } from '@dorado/components'
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
          {/* LIVE DEFECT FIXED: `bg-primary` sits on the banner and `text-white`
              sat on this heading, so base.css's `.bg-primary.text-white` bridge -
              which matches BOTH classes on ONE element - never covered it.
              --primary is white now, so this was white-on-white. The banner is
              not the page ground, so the heading names the on-primary token
              rather than inheriting typography.css's near-white heading colour. */}
          <h2 className="text-center text-primary-foreground">
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
                      <p className="pl-1">Up to</p>
                      <dt className="sr-only">{metal} payout</dt>
                      {/* Was text-5xl/6xl (48-60px). No TAG reaches display
                          size - typography.css defines --text-display (64px)
                          but maps no element to it - and `text-display` is a
                          type utility, which the scatter target forbids. h2
                          (28px) is the largest tag that does not add a fifth
                          top-level heading to this page (app/page.tsx already
                          has one). SEE THE REPORT: this is the one real visual
                          regression of the P1 sweep. */}
                      <dd>
                        <h2>{pctLabel(value)}</h2>
                      </dd>
                      <p className="pl-1">on {metal}</p>
                    </div>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
        <p className="text-center max-w-2xl mx-auto mb-8 md:mb-12 px-4">
          We buy at rates you won't find anywhere else. Skip the local pawn shop or jewelry store—
          you deserve a fair market value for your metals.
        </p>
        <div className="flex justify-center -mb-5">
          <Button variant="secondary" size="lg" className="z-1" onClick={() => router.push('/rates')}>
            View Full Rates
          </Button>
        </div>

        <div className="h-12 bg-primary" />
      </section>
    </>
  )
}
