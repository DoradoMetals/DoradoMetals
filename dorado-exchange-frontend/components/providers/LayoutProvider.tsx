'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'
import { useGetSession, useStopImpersonation } from '@/lib/queries/useAuth'
import ShellSkeleton from '../skeletons/ShellSkeleton'
import Footer from '../custom/nav/footer'
import { Button } from '../ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb'
import React from 'react'
import Link from 'next/link'
import { useDrawerStore } from '@/store/drawerStore'
import { AnimatePresence, motion } from 'framer-motion'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { activeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  const { user, isPending, session } = useGetSession()

  const stopImpersonation = useStopImpersonation()

  if (!session && isPending === true) {
    return (
      <>
        <ShellSkeleton />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col min-h-screen">
        <AnimatePresence>
          {isAnyDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{
                opacity: { duration: 0.3, ease: 'easeInOut' },
                backdropFilter: {
                  type: 'spring',
                  stiffness: 80,
                  damping: 20,
                },
              }}
              className="z-10 fixed sm:inset-0 sm:z-65 sm:bg-black/50 sm:pointer-events-none sm:will-change-[opacity,backdrop-filter]"
            />
          )}
        </AnimatePresence>
        <Shell />
        {session?.impersonatedBy && (
          <div className="z-50 sticky top-24 bg-destructive w-full raised-off-page">
            <div className="flex w-full items-center justify-between px-3 lg:px-20 py-1">
              <div className="flex flex-col gap-1 items-start">
                <div className="text-lg font-medium lg:text-xl lg:font-bold lg:tracking-widest text-white">
                  Impersonating {user?.name}
                </div>
                <div className="hidden lg:block text-sm text-white font-normal">
                  Please be very careful of any changes you make while impersonating a user.
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive bg-white raised-off-page hover:bg-white hover:text-destructive"
                onClick={() => stopImpersonation.mutate()}
              >
                Stop Impersonating
              </Button>
            </div>
          </div>
        )}
        {pathname !== '/' && <BreadcrumbNav />}

        <div className="flex flex-col relative flex-grow">
          {showMobileCarousel && <MobileProductCarousel />}
          {children}
        </div>
        <div className="mt-auto">
          <Footer />
        </div>
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
    <div className="hidden lg:flex lg:px-20 pt-2">
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
