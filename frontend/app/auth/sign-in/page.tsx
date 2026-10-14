'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSendCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useGoogleSignIn } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { useMessageTab } from '@/shared/hooks/useMessageTab'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { messageOf } from '@/shared/utils/authForm'
import { nextFrom } from '@/shared/utils/returnTo'

function SignIn() {
  const router = useRouter()
  const params = useSearchParams()
  const [digits, setDigits] = useState('')
  const sendCode = useSendCode()
  const messageTab = useMessageTab()
  const captcha = useCaptcha()
  const google = useGoogleSignIn()
  const { setVerification } = useVerification()

  const submit = async () => {
    const phone_number = `+1${digits}`
    try {
      const view = await messageTab.run(async () =>
        sendCode.mutateAsync({ channel: 'sms', phone_number, captcha_token: await captcha.token() })
      )
      setVerification({ view, channel: 'sms', phone_number, next: nextFrom(params) ?? undefined })
      router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
    } finally {
      captcha.reset()
    }
  }

  return (
    <AuthForm
      state="sign-in"
      value={formatPhoneNumber(digits)}
      onValueChange={(next) => setDigits(normalizePhone(next))}
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
