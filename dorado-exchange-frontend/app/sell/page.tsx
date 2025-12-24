'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/base/tabs'
import BullionTab from '@/features/products/ui/BullionTab'
import ScrapForm from '@/features/scrap/ui/ScrapTab'

export default function Page() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'bullion'

  const handleTabChange = (tab: string) => {
    const newUrl = `${pathname}?tab=${tab}`
    router.replace(newUrl, { scroll: false })
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <Suspense fallback={<p>Loading...</p>}>
        <Tabs
          defaultValue={currentTab}
          onValueChange={handleTabChange}
          className="flex w-full px-5 max-w-2xl mt-4 lg:mt-8"
        >
          <TabsList className="justify-center h-auto w-full gap-2 rounded-none bg-transparent px-0 text-foreground mb-0 pb-0">
            <TabsTrigger value="bullion" className="tab-indicator-primary">
              Bullion
            </TabsTrigger>
            <TabsTrigger value="scrap" className="tab-indicator-primary">
              Scrap
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[7px]" />
          <TabsContent
            value="bullion"
            className="outline-none focus:outline-none focus:ring-none"
            tabIndex={-1}
          >
            <BullionTab />
          </TabsContent>
          <TabsContent value="scrap" className="">
            <ScrapForm />
          </TabsContent>
        </Tabs>
      </Suspense>
    </div>
  )
}
