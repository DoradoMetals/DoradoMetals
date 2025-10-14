'use client'

import { Button } from '@/components/ui/button'
import { usePayoutBrackets } from '@/lib/queries/usePayoutBrackets'
import { Metal, pctLabel, topRatesByMetal } from '@/types/payout-brackets'
import Image from 'next/image'
import { useMemo } from 'react'

export default function Home() {
  const { data: rates = [] } = usePayoutBrackets()
  const top4 = useMemo(() => topRatesByMetal(rates), [rates])

  return (
    <div className="flex flex-col h-full w-full bg-white items-center justify-center py-2 sm:py-8 gap-5 sm:gap-10">
      {/* Hero */}
      <section
        aria-label="Dorado hero"
        className="w-full flex flex-col items-center justify-center"
      >
        <div className="flex items-center justify-center max-w-5xl p-4">
          <div className="flex flex-col items-center w-full gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl sm:text-4xl text-neutral-900 font-semibold text-left sm:text-center">
                Precious Metals Trading Made Easy
              </h1>
              <h4 className="text-base sm:text-xl text-neutral-800 text-left sm:text-center">
                Buying and selling precious metals can be stressful. We're here to fix that.
              </h4>
            </div>
            <div className="hidden sm:flex items-center justify-center">
              <Image
                src={'/landing-page.svg'}
                alt="landing-page-svg"
                height={3000}
                width={3000}
              ></Image>
            </div>
            <div className="flex sm:hidden items-center justify-center">
              <Image
                src={'/landing-page-mobile.svg'}
                alt="landing-page-svg"
                height={3000}
                width={3000}
              ></Image>
            </div>
            <Button className="liquid-gold raised-off-page px-9 sm:px-10 py-6 sm:py-7 text-white text-lg sm:text-2xl">
              Get An Estimate
            </Button>
          </div>
        </div>
      </section>

      {/* Rates */}
      <section aria-label="Our current rates" className="w-full bg-white flex flex-col">
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
        <div className="flex items-center justify-center -mt-6 sm:-mt-20 w-full mb-8 md:mb-12">
          <div className="flex flex-col items-center w-full max-w-5xl gap-4 md:gap-6">
            <p className="flex md:hidden text-neutral-600 text-2xl my-2 md:my-4 md:pl-1">Up to</p>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-8 w-full max-w-4xl">
              {top4.map((r, i) => {
                const metal = ['Gold', 'Silver', 'Platinum', 'Palladium'][i] as Metal
                const value = r?.payout_pct ?? null
                return (
                  <div key={metal} className="flex justify-center items-center">
                    <dt className="sr-only">{metal} payout</dt>
                    <dd className="flex flex-col items-start text-5xl sm:text-6xl font-bold text-neutral-900">
                      {pctLabel(value)}
                      <p className="text-base text-neutral-700 pl-1 tracking-wide font-normal">on {metal}</p>
                    </dd>
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
          <Button className="bg-white raised-off-page px-6 sm:px-8 py-5 text-white text-lg z-1 text-primary hover:text-white hover:bg-primary">
            View Full Rates
          </Button>
        </div>

        <div className="h-12 bg-primary" />
      </section>
    </div>
  )
}
