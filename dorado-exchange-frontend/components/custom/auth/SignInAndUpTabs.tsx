import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SignInForm from './signInForm'
import SignUpForm from './signUpForm'

export function SignInAndUpTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'sign-in'

  const handleTabChange = (tab: string) => {
    const newUrl = `${pathname}?tab=${tab}`
    router.replace(newUrl, { scroll: false }) // Update URL without full reload
  }

  return (
    <Tabs defaultValue={currentTab} onValueChange={handleTabChange} className="flex w-full px-10 max-w-lg mt-10 lg:mt-24">
      <TabsList className="justify-center h-auto w-full gap-2 rounded-none bg-transparent px-0 py-1">
        <TabsTrigger className="tab-indicator-primary" value="sign-in">
          Sign In
        </TabsTrigger>
        <TabsTrigger className="tab-indicator-primary" value="sign-up">
          Sign Up
        </TabsTrigger>
      </TabsList>
      <div className="separator-inset -mt-[11px] mb-8" />

      <TabsContent value="sign-in">
        <SignInForm />
      </TabsContent>
      <TabsContent value="sign-up">
        <SignUpForm />
      </TabsContent>
    </Tabs>
  )
}
