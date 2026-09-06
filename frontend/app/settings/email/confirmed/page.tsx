'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'

export default function Page() {
  const router = useRouter()
  const { confirmed, setConfirmed } = useVerification()

  useEffect(() => {
    if (!confirmed) router.replace('/account')
  }, [confirmed, router])

  if (!confirmed) return null

  return (
    <AuthForm
      state="confirmed"
      view={confirmed}
      onDone={() => {
        setConfirmed(null)
        router.replace('/account')
      }}
    />
  )
}
