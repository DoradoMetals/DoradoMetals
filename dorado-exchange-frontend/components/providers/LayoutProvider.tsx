'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'
import { useGetSession, useStopImpersonation } from '@/lib/queries/useAuth'
import ShellSkeleton from '../skeletons/ShellSkeleton'
import Footer from '../custom/nav/footer'
import { Button } from '../ui/button'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { user, isPending, session } = useGetSession()
  const stopImpersonation = useStopImpersonation()

  if (!user && isPending) {
    return (
      <>
        <ShellSkeleton />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col min-h-screen">
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
