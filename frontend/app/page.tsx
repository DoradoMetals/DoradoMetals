'use client'

import { Button } from '@dorado/components'
import Banner from '@/shared/ui/Banner'
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
    <main className="flex flex-col h-full w-full items-center justify-center py-2 sm:py-8 gap-5 sm:gap-10 pb-20">
      <LandingMain />
      <Rates />
      <Payout />
      <SupportBanner />
      <Intake />
      <Reviews />
    </main>
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
              <h1 className="text-left sm:text-center">Precious Metals Trading Made Easy</h1>
              <p className="text-left sm:text-center">
                Buying and selling precious metals can be stressful. We're here to fix that.
              </p>
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
            <Button size="xl" onClick={() => router.push('/sell')}>
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
    <Banner label="Support" className="py-2" contentClassName="flex items-center justify-between">
      <h4 className="hidden md:block">Need Support? Give us a call.</h4>
      <h4 className="md:hidden">Need Support?</h4>
      <a
        href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
        className="flex items-center gap-1 justify-end"
      >
        <PhoneIcon className="hidden md:block" size={36} />
        <PhoneIcon className="md:hidden" size={24} weight="bold" />

        <strong>{formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}</strong>
      </a>
    </Banner>
  )
}
