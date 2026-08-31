import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'
import { Separator } from '@/shared/ui/base/separator'
import SignInForm from './SignInForm'
import SignUpForm from './SignUpForm'

export function SignInAndUpTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'sign-in'

  const handleTabChange = (tab: string) => {
    const newUrl = `${pathname}?tab=${tab}`
    router.replace(newUrl, { scroll: false })
  }

  return (
    <Tabs defaultValue={currentTab} onValueChange={handleTabChange} className="flex w-full px-10 max-w-lg mt-10 lg:mt-10">
      <TabsList className="justify-center w-full gap-2 py-1">
        <TabsTrigger value="sign-in">
          Sign In
        </TabsTrigger>
        <TabsTrigger value="sign-up">
          Sign Up
        </TabsTrigger>
      </TabsList>
      <Separator className="-mt-[11px] mb-8" />

      <TabsContent value="sign-in">
        <SignInForm />
      </TabsContent>
      <TabsContent value="sign-up">
        <SignUpForm />
      </TabsContent>
    </Tabs>
  )
}
