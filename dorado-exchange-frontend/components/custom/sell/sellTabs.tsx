import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import StepperDemo from "./scrap/scrapTab"

export function SellTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'bullion'

  const handleTabChange = (tab: string) => {
    const newUrl = `${pathname}?tab=${tab}`
    router.replace(newUrl, { scroll: false }) // Update URL without full reload
  }

  return (
    <Tabs defaultValue={currentTab} onValueChange={handleTabChange} className="flex w-full px-5 max-w-lg lg:mt-8">
      <TabsList className="justify-center h-auto w-full gap-2 rounded-none border-b border-border bg-transparent px-0 py-1 text-foreground">
        <TabsTrigger value="bullion" className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary">
          Bullion
        </TabsTrigger>
        <TabsTrigger value="scrap" className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary" >
          Scrap
        </TabsTrigger>
      </TabsList>
      <TabsContent value="bullion">
      </TabsContent>
      <TabsContent value="scrap">
       <StepperDemo />
      </TabsContent>
    </Tabs>
  )
}

