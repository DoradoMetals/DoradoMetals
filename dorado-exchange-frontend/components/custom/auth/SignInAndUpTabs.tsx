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
    <Tabs defaultValue={currentTab} className="flex w-full px-3 sm:max-w-lg mt-30">
      <TabsList className="justify-center h-auto w-full gap-2 rounded-none border-b border-border bg-transparent px-0 py-1 text-foreground">
        <TabsTrigger value="sign-in" className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-accent ">
          Sign In
        </TabsTrigger>
        <TabsTrigger className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-accent" value="sign-up">
          Sign Up
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sign-in">
        <SignInForm />
      </TabsContent>
      <TabsContent value="sign-up">
        <SignUpForm />
      </TabsContent>
    </Tabs>
  )
}
