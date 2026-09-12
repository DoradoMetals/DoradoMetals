'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@dorado/components'
import { ChevronLeft } from '@dorado/icons'

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
      width={49}
      height={24}
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
          <LogoSymbol className="h-[51px] w-auto lg:h-[59px]" />
          <div className="w-full">{children}</div>
        </div>
      </div>
      <div aria-hidden className="hidden flex-1 bg-card lg:block" />
    </main>
  )
}
