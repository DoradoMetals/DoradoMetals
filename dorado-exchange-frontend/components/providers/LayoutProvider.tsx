'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'
import { useGetSession } from '@/lib/queries/useAuth'
import ShellSkeleton from '../skeletons/ShellSkeleton'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/', '/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const {user, isPending} = useGetSession();

  if (!user && isPending) {
    return (
      <>
        <ShellSkeleton />
      </>
    )
  }

  return (
    <>
      <div>
        <Shell />
        {showMobileCarousel && <MobileProductCarousel />}
        {children}
      </div>
    </>
  )
}
