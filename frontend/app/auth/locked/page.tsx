'use client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'

export default function Page() {
  const { verification } = useVerification()
  return <AuthForm state="locked" view={verification?.view ?? null} />
}
