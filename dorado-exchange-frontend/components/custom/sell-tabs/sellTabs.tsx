import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import StepperDemo from "./scrap/scrapTab"


export function SellTabs() {

  return (
    <Tabs defaultValue="bullion" className="w-full px-3 sm:max-w-xl mt-3">
      <TabsList className="grid w-full grid-cols-2 bg-card">
        <TabsTrigger className="cursor-pointer" value="bullion">Bullion</TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="scrap">Scrap</TabsTrigger>
      </TabsList>
      <TabsContent value="bullion">
      </TabsContent>
      <TabsContent value="scrap">
        <StepperDemo />
      </TabsContent>
    </Tabs>
  )
}
