'use client'

import FeaturedProducts from '@/components/custom/nav/featuredProducts'
import { Button } from '@/components/ui/button'
import {
  CalculatorIcon,
  EyeIcon,
  HandshakeIcon,
  LightningIcon,
  PaperPlaneTiltIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import MobileProductCarousel from '../components/custom/products/mobileProductCarousel'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useUser } from '@/lib/authClient'

export default function Home() {
  const router = useRouter()
  const { user } = useUser()

  return (
    <div className="">
      <div className="flex flex-col w-full">
        {/* desktop */}
        <div className="hidden relative lg:flex flex-col">
          <div className="relative flex min-h-[50vh] items-center justify-center">
            <div className=" absolute inset-0 bg-primary/25 dark:bg-transparent z-10 pointer-events-none" />
            <div className="w-full max-w-[80vw]">
              <div className="relative flex items-center justify-between w-full">
                <div className="w-full flex flex-col h-full gap-5">
                  <h1 className="text-6xl text-neutral-900 z-20">Precious Metals Trading</h1>
                  <div className="text-xl text-neutral-700 max-w-xl z-20">
                    Trading metals shouldn't be complicated. Built to be smarter, simpler, and
                    fairer, we make it easy to get real prices, fast decisions, and full
                    transparency without compromise.
                  </div>
                  {!user && (
                    <Button
                      variant={'default'}
                      className="mt-10 max-w-lg text-white hover:text-white text-lg font-normal raised-off-page liquid-gold shine-on-hover"
                      onClick={() => {
                        router.push('/account')
                      }}
                    >
                      Get Started
                    </Button>
                  )}
                </div>
                <div className="relative h-full w-full">
                  <Image
                    src="/homepage_images/falling-bars.png"
                    height={2000}
                    width={2000}
                    className="object-cover"
                    alt="thumbnail"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-10">
            <div className="flex flex-col w-full justify-center items-center gap-10 pb-10">
              <div className="flex justify-center items-center w-full liquid-gold">
                <div className="flex w-full items-center justify-between p-2 max-w-[80vw]">
                  <div className="text-2xl text-white">
                    Selling your metal online has never been easier.
                  </div>
                  <div className="-my-30">
                    <Button
                      className="liquid-gold shine-on-hover raised-off-page text-white text-lg p-8 z-30"
                      onClick={() => router.push('/sell')}
                    >
                      Get an Estimate
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-center w-full">
                <div className="flex w-full max-w-[80vw] items-center justify-between p-2">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-3">
                      <CalculatorIcon size={24} color={getPrimaryIconStroke()} />
                      <div className="text-xl text-neutral-800 font-medium">Instant estimates</div>
                    </div>
                    <div className="text-base text-neutral-600 max-w-md">
                      No more waiting or wondering. Input your items, and receive an immediate
                      estimate, giving you upfront insight into your potential payout.
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-3 w-full">
                        <PaperPlaneTiltIcon size={24} color={getPrimaryIconStroke()} />
                        <div className="text-xl text-neutral-800 font-medium">
                          Effortless shipping
                        </div>
                      </div>
                      <div className="text-base text-neutral-600 max-w-md">
                        From prepaid labels to fully insured shipments, sending in your metals is
                        easy and risk-free. Just pack, ship, and relax - we'll handle the rest.
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-3">
                        <LightningIcon size={24} color={getPrimaryIconStroke()} />
                        <div className="text-xl text-neutral-800 font-medium">
                          Lightning-fast payouts
                        </div>
                      </div>
                      <div className="text-base text-neutral-600 max-w-md">
                        Once your items are evaluated and your offer accepted, we process payouts
                        immediatley - so you get your funds without delays.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col w-full justify-center items-center pb-10">
              <div className="flex justify-center items-center w-full secondary-gradient">
                <div className="flex w-full items-center justify-between p-2 max-w-[80vw]">
                  <div className="text-sm lg:text-2xl text-white">
                    Buy precious metals with confidence.
                  </div>
                  <div className="-my-30">
                    <Button
                      className="secondary-gradient hover:secondary-gradient shine-on-hover raised-off-page text-white text-lg p-8"
                      onClick={() => router.push('/buy')}
                    >
                      See All Products
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-center w-full my-6">
                <div className="flex w-full max-w-[80vw] items-center justify-between p-2">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-3">
                      <EyeIcon size={24} className="text-secondary" />
                      <div className="text-xl text-neutral-800 font-medium">
                        Transparent pricing
                      </div>
                    </div>
                    <div className="text-base text-neutral-600 max-w-md">
                      View clear, competitive pricing in real time — no hidden fees, no fine print,
                      just full transparency.
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-3 w-full">
                        <ShieldCheckIcon size={24} className="text-secondary" />
                        <div className="text-xl text-neutral-800 font-medium">
                          White-glove insured delivery
                        </div>
                      </div>
                      <div className="text-base text-neutral-600 max-w-md">
                        Every order is carefully packaged, fully insured, and shipped with priority
                        handling to ensure it arrives in pristine condition.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-3">
                        <HandshakeIcon size={24} className="text-secondary" />
                        <div className="text-xl text-neutral-800 font-medium">
                          Seamless checkout experience
                        </div>
                      </div>
                      <div className="text-base text-neutral-600 max-w-md">
                        Our streamlined checkout process is fast, secure, and designed to make
                        purchasing precious metals effortless.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col w-full items-center max-w-[80vw] gap-2 px-2 mb-2"></div>
              <div className="flex items-center justify-center">
                <div className="flex flex-col w-full max-w-[80vw] gap-2 px-2">
                  <div className="text-xl text-neutral-800 font-medium -mb-10">Featured</div>
                  <FeaturedProducts />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* mobile */}
        <div className="flex flex-col lg:hidden bg-background">
          <div className="relative flex min-h-[35vh]">
            <Image
              src="/homepage_images/falling-bars.png"
              fill
              className="object-cover"
              alt="thumbnail"
              priority
            />
            <div className="absolute inset-0 bg-neutral-200/70 z-10 pointer-events-none" />

            <div className="absolute inset-0 z-20 flex items-start justify-start w-full">
              <div className="flex items-start justify-start w-full">
                <div className="flex flex-col h-full w-full">
                  <div className="flex flex-col h-full gap-5 pl-5 pt-10 lg:max-w-[45vw] lg:pl-40 lg:pt-40">
                    <div className="text-3xl text-neutral-900 font-medium">
                      Precious Metals Trading
                    </div>
                    <div className="text-sm text-neutral-800">
                      Trading metals shouldn't be complicated. Built to be smarter, simpler, and
                      fairer, we make it easy to get real prices, fast decisions, and full
                      transparency without compromise.
                    </div>
                  </div>
                  {!user && (
                    <div className="flex items-center justify-center w-full">
                      <Button
                        variant={'default'}
                        className="w-full mt-10 text-white text-lg font-normal max-w-xs raised-off-page liquid-gold shine-on-hover"
                        onClick={() => {
                          router.push('/authentication')
                        }}
                      >
                        Get Started
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col lg:hidden">
            <div className="flex w-full justify-center liquid-gold">
              <div className="text-base text-white p-2">
                Selling your metal online has never been easier.
              </div>
            </div>
            <div className="flex flex-col gap-6 px-4 py-8">
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <CalculatorIcon size={24} color={getPrimaryIconStroke()} />
                    <div className="text-2xl text-neutral-800 font-medium">Instant estimates</div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    No more waiting or wondering. Input your items, and receive an immediate
                    estimate, giving you upfront insight into your potential payout.
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-center">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-1">
                      <PaperPlaneTiltIcon size={24} color={getPrimaryIconStroke()} />
                      <div className="text-2xl text-neutral-800 font-medium">
                        Effortless shipping
                      </div>
                    </div>
                    <div className="text-sm text-neutral-600 max-w-xs">
                      From prepaid labels to fully insured shipments,sending in your metals is easy
                      and risk-free. Just pack, ship, and relax - we'll handle the rest.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <LightningIcon size={24} color={getPrimaryIconStroke()} />
                    <div className="text-2xl text-neutral-800 font-medium">
                      Lightning-fast payouts
                    </div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    Once your items are evaluated and your offer accepted, we process payouts
                    immediately - so you get your funds without delays.
                  </div>
                </div>
              </div>
              <Button
                className="raised-off-page liquid-gold shine-on-hover w-full shadow-sm text-white text-base p-5"
                onClick={() => router.push('/sell')}
              >
                Get an Estimate
              </Button>
            </div>
          </div>
          <div className="flex flex-col lg:hidden">
            <div className="flex w-full justify-center secondary-gradient">
              <div className="text-base text-white p-2">Buy precious metals with confidence.</div>
            </div>
            <div className="flex flex-col gap-6 px-4 py-8">
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <EyeIcon size={24} className="text-secondary" />
                    <div className="text-2xl text-neutral-800 font-medium">Transparent pricing</div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    View clear, competitive pricing in real time — no hidden fees, no fine print,
                    just full transparency.
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <ShieldCheckIcon size={24} className="text-secondary" />
                    <div className="text-2xl text-neutral-800 font-medium">Insured delivery</div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    Every order is carefully packaged, fully insured, and shipped with priority
                    handling to ensure it arrives in pristine condition.
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <HandshakeIcon size={24} className="text-secondary" />
                    <div className="text-2xl text-neutral-800 font-medium">Seamless checkout</div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    Our streamlined checkout process is fast, secure, and designed to make
                    purchasing precious metals effortless.
                  </div>
                </div>
              </div>
              <div className="border border-secondary" />
              <MobileProductCarousel />
              <div className="flex items-center justify-center">
                <div className="flex flex-col w-full lg:max-w-[80vw] gap-2 px-2">
                  <div className="text-xl text-neutral-800 font-medium -mb-6">Featured</div>
                  <FeaturedProducts />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
