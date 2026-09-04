'use client'

import { Link } from '@dorado/components'
import NextLink from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { auth, magicLink, useUser } from '@/features/auth/authClient'
import SetPasswordForm from '@/features/auth/ui/SetPasswordForm'
import { Button } from '@dorado/components'

// Reached from the magic-link email (admin-created accounts, "your account is
// ready" order emails). The magic-link token IS the credential, so this page
// must be public: gating it behind ProtectedPage redirected the (not-yet
// -signed-in) user to /authentication before the token could be verified.
function VerifyLoginContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const { user } = useUser()

  const [status, setStatus] = useState<'verifying' | 'error' | 'success'>('verifying')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    magicLink
      .verify({ query: { token } })
      .then(() => {
        // Session cookie is now set. Magic-link verify carries no built-in
        // signal (unlike sign-in/sign-out/update-user), so the reactive
        // session atom is nudged by hand - better-auth's own documented way.
        auth.$store.notify('$sessionSignal')
        setStatus('success')
      })
      .catch(() => {
        setStatus('error')
      })
  }, [token])

  if (status === 'verifying') {
    return (
      <main className="flex flex-col items-center justify-center mt-10">
        <p>Signing you in...</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="flex flex-col items-center justify-center mt-10 gap-4">
        <p className="text-destructive">Invalid or expired link.</p>
        <Button onClick={() => router.push('/authentication')}>Go to Sign In</Button>
      </main>
    )
  }

  return (
    <main className="flex w-full justify-center items-center mt-10">
      <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 p-4">
        <header className="flex flex-col gap-1 mr-auto text-left">
          <h1>Welcome{user?.name ? `, ${user.name}` : ''}!</h1>
          <p>We suggest you set your password before doing anything else.</p>
        </header>
        <hr className="w-full" />

        <SetPasswordForm />
        <hr className="w-full" />
        {/* Navigation, not an action - the package Link, wrapping next/link so
            middle-click and new-tab work like the anchor it is. */}
        <Link asChild className="mr-auto">
          <NextLink href="/">No thanks, I&apos;ll do it later.</NextLink>
        </Link>
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <VerifyLoginContent />
    </Suspense>
  )
}
