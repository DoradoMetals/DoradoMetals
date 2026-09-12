'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSendCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useGoogleSignIn } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { messageOf } from '@/shared/utils/authForm'
import { nextFrom } from '@/shared/utils/returnTo'

function SignIn() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const sendCode = useSendCode()
  const captcha = useCaptcha()
  const google = useGoogleSignIn()
  const { setVerification } = useVerification()

  const submit = async () => {
    const captcha_token = await captcha.token()
    try {
      const view = await sendCode.mutateAsync({ channel: 'email', email, captcha_token })
      setVerification({ view, channel: 'email', email, next: nextFrom(params) ?? undefined })
      router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
    } finally {
      captcha.reset()
    }
  }

  return (
    <AuthForm
      state="sign-in-email"
      value={email}
      onValueChange={setEmail}
      onSubmit={submit}
      captcha={captcha.widget}
      pending={sendCode.isPending}
      message={messageOf(sendCode.error)}
      onGoogle={() => google.mutate()}
      googlePending={google.isPending}
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  )
}
