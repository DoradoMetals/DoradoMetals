'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { magicLink, useUser } from '@/lib/authClient'
import ResetPasswordForm from '@/components/custom/auth/resetPasswordForm'
import { Button } from '@/components/ui/button'
import ProtectedPage from '@/components/custom/auth/protectedPage'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const { user } = useUser()

  const [status, setStatus] = useState<'verifying' | 'error' | 'success'>('verifying')

  useEffect(() => {
    if (token) {
      magicLink
        .verify({ query: { token } })
        .then(() => {
          setStatus('success')
        })
        .catch(() => {
          setStatus('error')
        })
    } else {
      setStatus('error')
    }
  }, [token])

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center">
        <p className="text-red-500">Invalid or expired link.</p>
        <Button onClick={() => router.push('/')}>Go to Home</Button>
      </div>
    )
  }

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ProtectedPage requiredRoles={protectedRoutes.verifyLogin.roles}>
        <div className="flex w-full justify-center items-center mt-10">
          <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 p-4 rounded-lg">
            <div className="flex flex-col gap-1 mr-auto text-left">
              <div className="text-2xl text-neutral-900">Welcome, {user?.name}!</div>
              <div className="text-sm text-neutral-700">
                We suggest you reset your password before doing anything else.
              </div>
            </div>
            <div className="separator-inset" />

            <ResetPasswordForm />
            <div className="separator-inset" />
            <Button
              variant="link"
              className="text-sm text-neutral-600 mr-auto"
              onClick={() => router.push('/')}
            >
              No thanks, I'll do it later.
            </Button>
          </div>
        </div>
      </ProtectedPage>
    </Suspense>
  )
}
