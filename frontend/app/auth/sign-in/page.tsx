'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSendCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useGoogleSignIn } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { messageOf } from '@/shared/utils/authForm'

export default function Page() {
  const router = useRouter()
  const [digits, setDigits] = useState('')
  const sendCode = useSendCode()
  const captcha = useCaptcha()
  const google = useGoogleSignIn()
  const { setVerification } = useVerification()

  const submit = async () => {
    const phone_number = `+1${digits}`
    const view = await sendCode.mutateAsync({
      channel: 'sms',
      phone_number,
      captcha_token: await captcha('sign_in'),
    })
    setVerification({ view, channel: 'sms', phone_number })
    router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
  }

  return (
    <AuthForm
      state="sign-in"
      value={formatPhoneNumber(digits)}
      onValueChange={(next) => setDigits(normalizePhone(next))}
      onSubmit={submit}
      pending={sendCode.isPending}
      message={messageOf(sendCode.error)}
      onGoogle={() => google.mutate()}
      googlePending={google.isPending}
    />
  )
}
