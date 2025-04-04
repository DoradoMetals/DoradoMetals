'use client'

// import ProtectedPage from '@/components/custom/auth/protectedPage'
// import { protectedRoutes } from '@/types/routes'
import { UserTabs } from '@/components/custom/user-tabs/user-tabs'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/store/userStore'
import { UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const { user } = useUserStore()
  const router = useRouter()
  return (
    <div className="flex flex-col  h-full items-center gap-4">
      {user ? (
        <UserTabs />
      ) : (
          <div className="w-full h-full flex flex-1 flex-col items-center justify-center text-center my-24">
            <div className='mb-8'>
              <UserRoundX size={64} className="text-neutral-800" strokeWidth={1} />
            </div>
            <div className="flex-col items-center gap-1 mb-8">
              <h2 className="title-text tracking-wide">You're not signed in!</h2>
              <p className="tertiary-text">Please sign in to view and edit your account.</p>
            </div>
            <Link href="/buy" passHref>
              <Button
                variant="secondary"
                className="w-full px-15"
                onClick={() => {
                  router.push('/authentication')
                }}
              >
                Sign In
              </Button>
            </Link>
          </div>
      )}
    </div>
  )
}

{
  /* <ProtectedPage requiredRoles={protectedRoutes.account.roles}>

</ProtectedPage> */
}
