'use client'

import { usePathname } from 'next/navigation'
import Shell from '@/components/custom/nav/shell'
import MobileProductCarousel from '../custom/products/mobileProductCarousel'
import { useGetSession, useStopImpersonation } from '@/lib/queries/useAuth'
import ShellSkeleton from '../skeletons/ShellSkeleton'
import Footer from '../custom/nav/footer'
import { Button } from '../ui/button'

import React, { useEffect, useState } from 'react'

import { useDrawerStore } from '@/store/drawerStore'
import { AnimatePresence, motion } from 'framer-motion'
import { MagnifyingGlassIcon, PhoneIcon, XIcon } from '@phosphor-icons/react'
import { Input } from '../ui/input'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb'
import Link from 'next/link'
import { FloatingNav } from '../ui/floating-menu'
import { cn } from '@/lib/utils'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mobileProductCarouselRoutes = ['/buy']
  const showMobileCarousel = mobileProductCarouselRoutes.includes(pathname)

  const { activeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  const { user, isPending, session } = useGetSession()

  const stopImpersonation = useStopImpersonation()

  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (activeDrawer) {
      document.body.style.overflowY = 'hidden'
    } else {
      document.body.style.overflowY = ''
    }
  }, [activeDrawer])

  if (!session && isPending === true) {
    return (
      <>
        <ShellSkeleton />
      </>
    )
  }

  return (
    <>
      <div className='flex flex-col min-h-screen'>
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
        <Shell visible={visible} />

        <BreadcrumbBar visible={visible} setVisible={setVisible} />

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

        <div className="flex items-center justify-center relative flex-grow min-w-0">
          <div className="w-full max-w-7xl lg:mb-30">
            {showMobileCarousel && <MobileProductCarousel />}
            {children}
          </div>
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
          isAnyDrawerOpen ? 'shadow-none' : 'raised-off-page'
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
                  variant="ghost"
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
                className="flex text-base text-neutral-800 gap-2 items-center justify-end"
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
