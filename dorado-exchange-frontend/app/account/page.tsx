'use client'

import { UserTabs } from '@/components/custom/user/user-tabs'
import { Button } from '@/components/ui/button'
import { useGetSession } from '@/lib/queries/useAuth'
import { UserRoundX } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const { user } = useGetSession();
  const router = useRouter()
  return (
    <div className="flex flex-col h-full items-center gap-4">
      {user ? (
        <UserTabs />
      ) : (
        <div className="w-full h-full flex flex-1 flex-col items-center justify-center text-center my-24">
          <div className="mb-8">
            <UserRoundX size={64} className="text-neutral-800" strokeWidth={1} />
          </div>
          <div className="flex-col items-center gap-1 mb-8">
            <h2 className="title-text tracking-wide">You're not signed in!</h2>
            <p className="tertiary-text">Please sign in to view and edit your account.</p>
          </div>
          <Button
            variant="secondary"
            className="w-full px-15 max-w-xl"
            onClick={() => {
              router.push('/authentication')
            }}
          >
            Sign In
          </Button>
        </div>
      )}
    </div>
  )
}
