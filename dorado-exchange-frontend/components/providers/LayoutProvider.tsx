'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import { useUserStore } from '@/store/userStore'
import { useEffect } from 'react'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const mobileProductCarouselRoutes = ['/', '/buy']

  const fetchSession = useUserStore((state) => state.fetchSession)

  useEffect(() => {
    fetchSession()
  }, [])

  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

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
