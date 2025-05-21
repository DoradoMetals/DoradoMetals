'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'
import { useGetSession } from '@/lib/queries/useAuth'
import ShellSkeleton from '../skeletons/ShellSkeleton'
import Footer from '../custom/nav/footer'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { user, isPending } = useGetSession()

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
        <div className="flex flex-col relative lg:pt-[1px] flex-grow">
          {showMobileCarousel && <MobileProductCarousel />}
          {children}
        </div>
        <div className='mt-auto'>
          <Footer />
        </div>
      </div>
    </>
  )
}
