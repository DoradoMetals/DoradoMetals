'use client'

import { useRouter } from 'next/navigation'
import { AuthForm } from '@/shared/ui/auth/AuthForm'

export default function Page() {
  const router = useRouter()
  return <AuthForm state="session-expired" onSignIn={() => router.push('/auth/sign-in')} />
}
