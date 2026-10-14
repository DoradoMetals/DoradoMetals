'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChangeEmail, useStepUp } from '@dorado/client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { useMessageTab } from '@/shared/hooks/useMessageTab'
import { protectedRoutes } from '@/shared/types/routes'
import { isStepUpRequired, messageOf } from '@/shared/utils/authForm'

function ChangeEmail() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const changeEmail = useChangeEmail()
  const stepUp = useStepUp()
  const messageTab = useMessageTab()
  const { setVerification } = useVerification()

  const submit = async () => {
    const [view, path] = await messageTab.run(async () => {
      try {
        return [await changeEmail.mutateAsync({ email }), '/auth/verify'] as const
      } catch (error) {
        if (!isStepUpRequired(error)) throw error
        return [await stepUp.mutateAsync(), '/auth/verify/step-up'] as const
      }
    })
    setVerification({ view, channel: view.channel, next: '/settings/email' })
    router.push(path === '/auth/verify' && view.status === 'locked' ? '/auth/locked' : path)
  }

  return (
    <AuthForm
      state="change-email"
      value={email}
      onValueChange={setEmail}
      onSubmit={submit}
      pending={changeEmail.isPending || stepUp.isPending}
      message={isStepUpRequired(changeEmail.error) ? null : messageOf(changeEmail.error)}
    />
  )
}

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.settingsEmail.roles}>
      <ChangeEmail />
    </ProtectedPage>
  )
}
