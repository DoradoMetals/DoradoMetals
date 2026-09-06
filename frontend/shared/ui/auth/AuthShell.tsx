'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@dorado/components'
import { ChevronLeft } from '@dorado/icons'

// The auth surface is its own page: a Panel holding the form and, from lg up, a
// Pitch beside it. The Back control moves - top-left of the Panel on desktop,
// its own row above the logo on mobile - so it is written once and placed by
// the two shells.
function BackButton() {
  const router = useRouter()
  return (
    <Button variant="tertiary" size="sm" onClick={() => router.back()}>
      <ChevronLeft aria-hidden />
      Back
    </Button>
  )
}

function LogoSymbol({ className }: { className: string }) {
  return (
    <Image
      src="/icons/branding/symbol/white/symbol.svg"
      alt="Dorado Metals Exchange"
      width={120}
      height={59}
      priority
      className={className}
    />
  )
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen w-full">
      <div className="flex w-full flex-col px-md py-xl lg:w-[520px] lg:shrink-0 lg:p-2xl">
        <div className="flex w-full items-center">
          <BackButton />
        </div>
        <div className="flex w-full flex-1 flex-col items-center gap-xl pt-xl lg:justify-center lg:pt-0">
          <LogoSymbol className="h-[51px] w-[104px] lg:h-[59px] lg:w-[120px]" />
          <div className="w-full">{children}</div>
        </div>
      </div>
      <div aria-hidden className="hidden flex-1 bg-card lg:block" />
    </main>
  )
}
