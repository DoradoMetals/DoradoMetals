'use client'

import AccountShell from '@/components/custom/user/accountShell'
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
        <AccountShell />
      ) : (
        <div className="w-full h-full flex flex-1 flex-col items-center justify-center text-center my-24 max-w-xs">
          <div className="mb-8">
            <UserRoundX size={96} className="text-neutral-800" strokeWidth={1} />
          </div>
          <div className="flex-col items-center gap-1 mb-8">
            <h2 className="text-2xl text-neutral-900 tracking-wide">You're not signed in!</h2>
            <p className="text-sm text-neutral-600">Please sign in to view your account.</p>
          </div>
          <Button
            variant="default"
            className="px-25 max-w-xl bg-primary raised-off-page text-white"
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
