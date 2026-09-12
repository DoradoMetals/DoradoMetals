'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignUp } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useGoogleSignIn } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { messageOf } from '@/shared/utils/authForm'

export default function Page() {
  const router = useRouter()
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
    const phone_number = `+1${digits}`
    const captcha_token = await captcha.token()
    try {
      const view = await signUp.mutateAsync({
        name,
        email,
        phone_number,
        accepted_terms: true,
        captcha_token,
      })
      setVerification({ view, channel: 'sms', phone_number })
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
