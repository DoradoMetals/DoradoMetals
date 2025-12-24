'use client'

import { Button } from '@/shared/ui/base/button'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { PhoneIcon } from '@phosphor-icons/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Rates } from '@/features/rates/ui/RatesLandingSection'
import { Payout } from '@/features/payouts/ui/PayoutLandingSection'
import { Intake } from '@/features/intake/ui/IntakeLandingSection'
import { Reviews } from '@/features/reviews/ui/ReviewsLandingSection'

export default function Home() {
  return (
    <div className="flex flex-col h-full w-full bg-card items-center justify-center py-2 sm:py-8 gap-5 sm:gap-10 pb-20">
      <LandingMain />
      <Rates />
      <Payout />
      <SupportBanner />
      <Intake />
      <Reviews />
    </div>
  )
}

function LandingMain() {
  const router = useRouter()

  return (
    <>
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
            <Button
              className="bg-primary raised-off-page px-9 sm:px-10 py-6 sm:py-7 text-white text-lg sm:text-xl"
              onClick={() => router.push('/sell')}
            >
              Get An Estimate
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

function SupportBanner() {
  return (
    <>
      <section aria-label="Support Banner" className="w-full bg-primary py-2">
        <div className="flex items-center justify-center">
          <div className="flex items-center w-full justify-between max-w-7xl px-4">
            <h4 className="text-white text-xl hidden md:block">Need Support? Give us a call.</h4>
            <h4 className="text-white text-sm  md:hidden">Need Support?</h4>
            <a
              href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
              className="flex items-center gap-1 justify-end"
            >
              <PhoneIcon className="text-white font-semibold hidden md:block" size={36} />
              <PhoneIcon className="text-white font-semibold md:hidden" size={24} weight="bold" />

              <h5 className="text-white font-semibold md:font-normal text-base md:text-2xl">
                {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
              </h5>
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
