'use client'

import FeaturedProducts from '@/components/custom/nav/featuredProducts'
import { Button } from '@/components/ui/button'
import { useHomepageProducts } from '@/lib/queries/useProducts'
import { Calculator, Eye, MousePointerClick, Send, ShieldCheck, Zap } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import MobileProductCarousel from '../components/custom/products/mobileProductCarousel'
import { useUser } from '@/lib/authClient'

export default function Home() {
  const router = useRouter()
  const { data: products = [], isLoading } = useHomepageProducts()
  const { user } = useUser()

  return (
    <div className="">
      <div className="flex flex-col w-full">
        {/* desktop */}
        <div className="hidden lg:flex flex-col">
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="w-full max-w-[80vw]">
              <div className="flex items-center justify-between w-full">
                <div className="w-full flex flex-col h-full gap-5">
                  <div className="text-6xl text-neutral-900">Metals Trading, Refined.</div>
                  <div className="text-xl text-neutral-700 max-w-xl">
                    Trading metals shouldn't be complicated. Built to be smarter, simpler, and
                    fairer, we make it easy to get real prices, fast decisions, and full
                    transparency without compromise.
                  </div>
                  {!user && (
                    <Button
                      variant={'default'}
                      className="mt-10 max-w-lg bg-card border border-primary text-primary hover:bg-primary hover:text-white text-lg font-normal"
                      onClick={() => {
                        router.push('/account')
                      }}
                    >
                      Get Started
                    </Button>
                  )}
                </div>
                <div className="h-full w-full">
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
            <div className="flex flex-col w-full justify-center items-center bg-card gap-10 pb-10">
              <div className="flex justify-center items-center w-full bg-linear-to-l from-primary-600 to-primary-500">
                <div className="flex w-full items-center justify-between p-2 max-w-[80vw]">
                  <div className="text-2xl text-white">
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
              <div className="flex justify-center w-full">
                <div className="flex w-full max-w-[80vw] items-center justify-between p-2">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-3">
                      <Calculator size={24} className="text-primary" />
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
                        <Send size={24} className="text-primary" />
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
            <div className="flex flex-col w-full justify-center items-center bg-card pb-10">
              <div className="flex justify-center items-center w-full bg-linear-to-l from-secondary-700 to-secondary-500">
                <div className="flex w-full items-center justify-between p-2 max-w-[80vw]">
                  <div className="text-sm lg:text-2xl text-white">
                    Buy precious metals with confidence.
                  </div>
                  <div className="-my-30">
                    <Button
                      className="bg-secondary hover:bg-secondary shadow-sm text-white text-lg p-8"
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
                      <Eye size={24} className="text-secondary" />
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
        <div className="flex flex-col lg:hidden">
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
                      Metals Trading, Refined.
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
                        className="w-full mt-10 bg-card text-white bg-primary text-lg font-normal max-w-xs shadow-lg"
                        onClick={() => {
                          router.push('/authentication')
                        }}
                      >
                        Get Started'
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col lg:hidden">
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
                    No more waiting or wondering. Input your items, and receive an immediate
                    estimate, giving you upfront insight into your potential payout.
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-center">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-1">
                      <Send size={24} className="text-primary" />
                      <div className="text-2xl text-neutral-800 font-medium">
                        Effortless shipping
                      </div>
                    </div>
                    <div className="text-sm text-neutral-600 max-w-xs">
                      From repaid labels to fully insured shipments,sending in your metals is easy
                      and risk-free. Just pack, ship, and relax - we'll handle the rest.
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
          <div className="flex flex-col lg:hidden">
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
                    View clear, competitive pricing in real time — no hidden fees, no fine print,
                    just full transparency.
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
                    Our streamlined checkout process is fast, secure, and designed to make
                    purchasing precious metals effortless.
                  </div>
                </div>
              </div>
              <div className="border border-secondary" />
              <MobileProductCarousel />
              <div className="flex items-center justify-center">
                <div className="flex flex-col w-full lg:max-w-[80vw] gap-2 px-2">
                  <div className="text-xl text-neutral-800 font-medium -mb-10">Featured</div>
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
