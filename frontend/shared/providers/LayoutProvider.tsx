'use client'

import { usePathname } from 'next/navigation'
import MobileProductCarousel from '../../features/products/ui/MobileProductCarousel'
import { Button } from '../ui/base/button'

import React, { useEffect, useState } from 'react'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { AnimatePresence, motion } from 'framer-motion'
import { MagnifyingGlassIcon, PhoneIcon, XIcon } from '@phosphor-icons/react'
import { Input } from '../ui/base/input'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/base/breadcrumb'
import Link from 'next/link'
import { FloatingNav } from '../../features/navigation/ui/FloatingMenu'
import { cn } from '@/shared/utils/cn'
import { useScrollLock } from '@/shared/hooks/useScrollock'
import { useGetSession, useStopImpersonation } from '@/features/auth/queries'
import { useRates } from '@/features/rates/queries'
import { sellCartStore } from '@/shared/store/sellCartStore'
import Shell from '@/features/navigation/ui/Shell'
import Footer from '@/features/navigation/ui/Footer'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { activeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  const { user, isPending, session } = useGetSession()

  const stopImpersonation = useStopImpersonation()

  const [visible, setVisible] = useState(true)

  // Keep the sell cart's rate table in sync so scrap premiums stay tiered to
  // current rates (backend re-resolves as the source of truth on submit).
  const { data: rates = [] } = useRates()
  const setSellCartRates = sellCartStore((s) => s.setRates)
  useEffect(() => {
    setSellCartRates(rates)
  }, [rates, setSellCartRates])

  useScrollLock(isAnyDrawerOpen)

  // THE SKELETON GOES OVER THE NAV, NOT OVER THE WHOLE DOCUMENT.
  //
  // This used to `return` the skeleton INSTEAD OF {children} while the session
  // query was pending, so every page in the app rendered nothing until an
  // authentication round-trip finished - including pages that need no session
  // at all. With the API unreachable it never finished: /rates was measured
  // empty at 2s, 10s, 40s and 77s. Ten routes declare seoIndex: true and every
  // one of them is public, so during any API blip the marketing site was a
  // blank page rather than a degraded one, and every cold visitor waited on
  // auth before seeing a word of copy.
  //
  // The skeleton was the right idea in the wrong place. What actually depends
  // on the session is the nav and the account controls inside Shell, so that is
  // what it stands in for now. Everything below renders immediately.
  const sessionPending = !session && isPending === true

  return (
    <>
      {/* THE HOMEPAGE GROUND IS `--background`, LIKE EVERY OTHER PAGE.

          `bg-card` used to be applied HERE, keyed on `pathname === '/'`, AND
          again on `app/page.tsx`'s own root - the same fill spelled twice, in
          two files, one of which is a layout provider making a decision about
          one specific route. The sweep removed the page's copy; this one goes
          too, and the reason is not tidiness.

          Ruling 19: the ground is the darkest thing on screen and panels
          separate by BORDER, not by fill. The homepage's bands - SupportBanner,
          the reviews strip - are `bg-card border-y border-border`, and a band
          that is the same colour as the page it interrupts is not a band. The
          two invisible white-on-white bands D95 found were on this page, and
          painting the whole route `bg-card` would make their fixed versions
          disappear a second way.

          The `max-w-7xl` exception two elements down STAYS: the homepage is
          deliberately full-bleed, and extent is layout. */}
      <div className="flex flex-col min-h-screen">
        <AnimatePresence>
          {isAnyDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(2px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{
                opacity: { duration: 0.3, ease: 'easeInOut' },
                backdropFilter: {
                  type: 'spring',
                  stiffness: 80,
                  damping: 20,
                },
              }}
              className="z-10 fixed sm:inset-0 sm:z-65 sm:bg-black/15 sm:pointer-events-none sm:will-change-[opacity,backdrop-filter]"
            />
          )}
        </AnimatePresence>

        {sessionPending ? <NavSkeleton /> : <Shell visible={visible} />}

        {/* <BreadcrumbBar visible={visible} setVisible={setVisible} /> */}

        {session?.impersonatedBy && (
          <div className="z-50 sticky top-24 bg-destructive w-full">
            <div className="flex w-full items-center justify-between px-3 lg:px-20 py-1">
              <div className="flex flex-col gap-1 items-start">
                <strong className="lg:tracking-widest text-destructive-foreground stat-sm">
                  Impersonating {user?.name}
                </strong>
                <small className="hidden lg:block text-destructive-foreground">
                  Please be very careful of any changes you make while impersonating a user.
                </small>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => stopImpersonation.mutate()}
              >
                Stop Impersonating
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-center relative flex-grow min-w-0">
          <div className={cn('w-full', pathname === '/' ? '' : 'max-w-7xl')}>
            {showMobileCarousel && <MobileProductCarousel />}
            {children}
          </div>
        </div>

        <div className="mt-auto">{<Footer />}</div>
      </div>
    </>
  )
}

function BreadcrumbNav() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const formatSegment = (segment: string) =>
    segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())

  return (
    <div className="hidden lg:block">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {segments.map((segment, i) => {
            const href = '/' + segments.slice(0, i + 1).join('/')
            const isLast = i === segments.length - 1
            const label = formatSegment(segment)

            return (
              <React.Fragment key={i}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={href}>{label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}

function BreadcrumbBar({
  visible,
  setVisible,
}: {
  visible: boolean
  setVisible: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const [input, setInput] = useState('')

  const { activeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  return (
    <div className="relative w-full">
      <FloatingNav
        className={cn(
          'inset-x-0 flex bg-highest items-center justify-center border-0 border-none lg:border-t-1 lg:border-border z-55',
          ''
        )}
        visible={visible}
        setVisible={setVisible}
      >
        <div className="flex max-w-7xl justify-center items-center w-full pb-2">
          <div className="flex w-full justify-between items-center">
            <div className="hidden lg:flex pl-2 w-1/3 justify-start">
              <BreadcrumbNav />
            </div>

            <div className="relative flex w-full lg:w-1/3 justify-center px-4 lg:px-0">
              <Input
                className="px-8 lg:px-10"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search..."
              />
              <div className="absolute left-6 lg:left-3 top-1/2 -translate-y-1/2 hover:bg-transparent">
                <MagnifyingGlassIcon className="text-neutral-600" size={18} />
              </div>
              {input !== '' && (
                <Button
                  variant="tertiary"
                  onClick={() => setInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                  tabIndex={-1}
                >
                  <XIcon size={16} />
                </Button>
              )}
            </div>

            <div className="hidden lg:flex w-1/3 justify-end">
              <a
                href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
                className="flex gap-2 items-center justify-end"
              >
                <PhoneIcon size={24} />
                {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
              </a>
            </div>
          </div>
        </div>
      </FloatingNav>
    </div>
  )
}

// The nav placeholder, held while the session resolves. Deliberately the same
// markup that used to replace the entire page - it was always a nav skeleton,
// it was just standing in front of everything else.
function NavSkeleton() {
  return (
    <div className="sticky top-0 z-50 mb-6 border-b border-border bg-card w-full">
      <div className="w-full bg-background py-2 px-4 sm:px-32 flex gap-6 overflow-x-auto animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex w-full gap-1 justify-between">
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
