'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'
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
    <main className="flex flex-col items-center gap-4">
      <Suspense fallback={<p>Loading...</p>}>
        <Tabs
          defaultValue={currentTab}
          onValueChange={handleTabChange}
          className="flex w-full px-5 max-w-2xl mt-4 lg:mt-8"
        >
          <TabsList className="justify-center w-full gap-2 mb-0">
            <TabsTrigger value="bullion">
              Bullion
            </TabsTrigger>
            <TabsTrigger value="scrap">
              Scrap
            </TabsTrigger>
          </TabsList>
          <hr className="w-full -mt-[7px]" />
          <TabsContent value="bullion" tabIndex={-1}>
            <BullionTab />
          </TabsContent>
          <TabsContent value="scrap">
            <ScrapForm />
          </TabsContent>
        </Tabs>
      </Suspense>
    </main>
  )
}
