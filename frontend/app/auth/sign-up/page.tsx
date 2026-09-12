'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSignUp } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useGoogleSignIn } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { messageOf } from '@/shared/utils/authForm'
import { nextFrom } from '@/shared/utils/returnTo'

function SignUp() {
  const router = useRouter()
  const params = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [digits, setDigits] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const signUp = useSignUp()
  const captcha = useCaptcha()
  const google = useGoogleSignIn()
  const { setVerification } = useVerification()

  const submit = async () => {
    if (!acceptedTerms) return
    const phone_number = digits ? `+1${digits}` : undefined
    const captcha_token = await captcha.token()
    try {
      const view = await signUp.mutateAsync({
        name,
        email,
        phone_number,
        accepted_terms: true,
        captcha_token,
      })
      setVerification(
        phone_number
          ? { view, channel: 'sms', phone_number, next: nextFrom(params) ?? undefined }
          : { view, channel: 'email', email, next: nextFrom(params) ?? undefined }
      )
      router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
    } finally {
      captcha.reset()
    }
  }

  return (
    <AuthForm
      state="sign-up"
      name={name}
      email={email}
      phone={formatPhoneNumber(digits)}
      acceptedTerms={acceptedTerms}
      onNameChange={setName}
      onEmailChange={setEmail}
      onPhoneChange={(next) => setDigits(normalizePhone(next))}
      onTermsChange={setAcceptedTerms}
      onSubmit={submit}
      captcha={captcha.widget}
      pending={signUp.isPending}
      message={messageOf(signUp.error)}
      onGoogle={() => google.mutate()}
      googlePending={google.isPending}
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignUp />
    </Suspense>
  )
}
