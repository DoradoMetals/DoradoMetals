'use client'

import { usePathname } from 'next/navigation'
import MobileProductCarousel from '@/shared/ui/MobileProductCarousel'
import { Button } from '@dorado/components'

import React from 'react'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/shared/utils/cn'
import { useScrollLock } from '@/shared/hooks/useScrollock'
import { useGetSession, useStopImpersonation } from '@/shared/hooks/auth/queries'
import Shell from '@/shared/ui/Shell'
import Footer from '@/shared/ui/Footer'
import { VerificationProvider } from '@/shared/providers/VerificationProvider'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { activeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  const { user, isPending, session } = useGetSession()

  const stopImpersonation = useStopImpersonation()

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

  // THE AUTH SURFACE IS ITS OWN PAGE. /auth and /settings are the Panel/Pitch
  // screens: full-bleed, no site nav and no footer, because the Back control
  // and the logo in the Panel are the only chrome the design gives them.
  // THE HOMEPAGE GROUND IS `--background`, LIKE EVERY OTHER PAGE (ruling 19):
  // the ground is the darkest thing on screen and panels separate by BORDER,
  // not by fill. The `max-w-7xl` exception below stays - the homepage is
  // deliberately full-bleed, and extent is layout.
  const bare = pathname.startsWith('/auth') || pathname.startsWith('/settings')

  return (
    <VerificationProvider>
      {bare ? (
        children
      ) : (
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

          {sessionPending ? <NavSkeleton /> : <Shell />}

          {session?.impersonatedBy && (
            <div className="z-50 sticky top-24 bg-destructive w-full">
              <div className="flex w-full items-center justify-between px-3 lg:px-20 py-1">
                <div className="flex flex-col gap-1 items-start">
                  <strong className="lg:tracking-widest text-destructive-foreground">
                    Impersonating {user?.name}
                  </strong>
                  <small className="hidden lg:block text-destructive-foreground">
                    Please be very careful of any changes you make while impersonating a user.
                  </small>
                </div>
                <Button variant="primary" size="sm" onClick={() => stopImpersonation.mutate()}>
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
      )}
    </VerificationProvider>
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
