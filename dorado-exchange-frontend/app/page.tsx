'use client'

import { Button } from '@/components/ui/button'
import { Calculator, Eye, MousePointerClick, Send, ShieldCheck, Zap } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  return (
    <div className="">
      <div className="flex flex-col w-full gap-10 mb-10">
        <div className="relative flex min-h-[35vh] lg:min-h-[50vh]">
          <Image
            src="/homepage_images/bar-grid.jpg"
            fill
            className="object-cover"
            alt="thumbnail"
            priority
          />
          <div className="absolute inset-0 bg-black/80 z-10 pointer-events-none" />

          <div className="absolute inset-0 z-20 flex items-start justify-start w-full">
            <div className="flex flex-col h-full w-full">
              <div className="flex flex-col h-full text-white gap-5 pl-5 pt-10 lg:max-w-[45vw] lg:pl-40 lg:pt-40">
                <div className="text-3xl lg:text-6xl">Metals Trading, Refined.</div>
                <div className="text-sm lg:text-xl text-neutral-300 dark:text-neutral-700">
                  Trading metals shouldn't be complicated. Built to be smarter, simpler, and fairer,
                  we make it easy to get real prices, fast decisions, and full transparency without
                  compromise.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* desktop selling */}
        <div className="hidden sm:flex flex-col w-full justify-center items-center bg-card gap-10 pb-10">
          <div className="flex justify-center items-center w-full bg-linear-to-l from-primary-600 to-primary-500">
            <div className="flex w-full items-center justify-between p-2 lg:max-w-[73vw]">
              <div className="text-sm lg:text-2xl text-white">
                Selling your metal online has never been easier.
              </div>
              <div className="-my-30">
                <Button
                  className="bg-primary hover:bg-primary shadow-sm text-white text-lg p-8"
                  onClick={() => router.push('/sell')}
                >
                  Get an Estimate
                </Button>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex justify-center w-full">
            <div className="flex w-full lg:max-w-[73vw] items-center justify-between p-2">
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-3">
                  <Calculator size={24} className="text-primary" />
                  <div className="text-xl text-neutral-800 font-medium">Instant estimates</div>
                </div>
                <div className="text-base text-neutral-600 max-w-md">
                  No more waiting or wondering. Input your items, and receive an immediate estimate,
                  giving you upfront insight into your potential payout.
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-3 w-full">
                    <Send size={24} className="text-primary" />
                    <div className="text-xl text-neutral-800 font-medium">Effortless shipping</div>
                  </div>
                  <div className="text-base text-neutral-600 max-w-md">
                    From prepaid labels to fully insured shipments, sending in your metals is easy
                    and risk-free. Just pack, ship, and relax - we'll handle the rest.
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-3">
                    <Zap size={24} className="text-primary" />
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

        {/* mobile selling */}
        <div className="flex flex-col sm:hidden">
          <div className="flex w-full justify-center bg-linear-to-r from-primary-600 to-primary-500">
            <div className="text-base text-white p-2">
              Selling your metal online has never been easier.
            </div>
          </div>
          <div className="flex flex-col bg-linear-to-r from-highest to-card gap-6 px-4 py-8">
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1">
                  <Calculator size={24} className="text-primary" />
                  <div className="text-2xl text-neutral-800 font-medium">Instant estimates</div>
                </div>
                <div className="text-sm text-neutral-600 max-w-xs">
                  No more waiting or wondering. Input your items, and receive an immediate estimate,
                  giving you upfront insight into your potential payout.
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-1">
                  <div className="flex items-center gap-1">
                    <Send size={24} className="text-primary" />
                    <div className="text-2xl text-neutral-800 font-medium">Effortless shipping</div>
                  </div>
                  <div className="text-sm text-neutral-600 max-w-xs">
                    From repaid labels to fully insured shipments,sending in your metals is easy and
                    risk-free. Just pack, ship, and relax - we'll handle the rest.
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1">
                  <Zap size={24} className="text-primary" />
                  <div className="text-2xl text-neutral-800 font-medium">
                    Lightning-fast payouts
                  </div>
                </div>
                <div className="text-sm text-neutral-600 max-w-xs">
                  Once your items are evaluated and your offer accepted, we process payouts
                  immediatley - so you get your funds without delays.
                </div>
              </div>
            </div>
            <Button
              className="bg-primary w-full hover:bg-primary shadow-sm text-white text-base p-5"
              onClick={() => router.push('/sell')}
            >
              Get an Estimate
            </Button>
          </div>
        </div>

        {/* desktop buying */}
        <div className="hidden sm:flex flex-col w-full justify-center items-center bg-card gap-10 pb-10">
          <div className="flex justify-center items-center w-full bg-linear-to-l from-secondary-700 to-secondary-500">
            <div className="flex w-full items-center justify-between p-2 lg:max-w-[73vw]">
              <div className="text-sm lg:text-2xl text-white">
                Buy precious metals with confidence.
              </div>
              <div className="-my-30">
                <Button
                  className="bg-secondary hover:bg-secondary shadow-sm text-white text-lg p-8"
                  onClick={() => router.push('/buy')}
                >
                  Start Shopping
                </Button>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex justify-center w-full">
            <div className="flex w-full lg:max-w-[73vw] items-center justify-between p-2">
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-3">
                  <Eye size={24} className="text-secondary" />
                  <div className="text-xl text-neutral-800 font-medium">Transparent pricing</div>
                </div>
                <div className="text-base text-neutral-600 max-w-md">
                  View clear, competitive pricing in real time — no hidden fees, no fine print, just
                  full transparency.
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-3 w-full">
                    <ShieldCheck size={24} className="text-secondary" />
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
                    <MousePointerClick size={24} className="text-secondary" />
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
        </div>

        {/* mobile buying */}
        <div className="flex flex-col sm:hidden">
          <div className="flex w-full justify-center bg-linear-to-r from-secondary-700 to-secondary-500">
            <div className="text-base text-white p-2">Buy precious metals with confidence.</div>
          </div>
          <div className="flex flex-col bg-linear-to-r from-highest to-card gap-6 px-4 py-8">
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1">
                  <Eye size={24} className="text-secondary" />
                  <div className="text-2xl text-neutral-800 font-medium">Transparent pricing</div>
                </div>
                <div className="text-sm text-neutral-600 max-w-xs">
                  View clear, competitive pricing in real time — no hidden fees, no fine print, just
                  full transparency.
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1">
                  <ShieldCheck size={24} className="text-secondary" />
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
                  <MousePointerClick size={24} className="text-secondary" />
                  <div className="text-2xl text-neutral-800 font-medium">Seamless checkout</div>
                </div>
                <div className="text-sm text-neutral-600 max-w-xs">
                  Our streamlined checkout process is fast, secure, and designed to make purchasing
                  precious metals effortless.
                </div>
              </div>
            </div>
            <Button
              className="bg-secondary w-full hover:bg-secondary shadow-sm text-white text-base p-5"
              onClick={() => router.push('/buy')}
            >
              Start Shopping
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
