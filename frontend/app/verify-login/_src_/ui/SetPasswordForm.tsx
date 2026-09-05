'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Form, ValidatedField } from '@dorado/components'
import { useSetPassword } from '@/shared/hooks/auth/queries'
import { ResetPassword, resetPasswordSchema } from '@/shared/types/auth'
import { PasswordRequirements } from '@/shared/ui/PasswordRequirements'

// Used on /verify-login, where the user is already authenticated via a magic
// link and has no password yet. Unlike ResetPasswordForm this needs no token —
// it sets the password against the active session.
export default function SetPasswordForm() {
  const router = useRouter()

  const [showRequirements, setShowRequirements] = useState(false)

  const setPasswordMutation = useSetPassword()

  const form = useForm<ResetPassword>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: ResetPassword) => {
    setPasswordMutation.mutate(values.password, {
      onSuccess: () => {
        form.reset()
        router.push('/')
      },
      onError: () => {
        form.setError('password', {
          type: 'manual',
          message: 'Could not set your password. Please try again.',
        })
      },
    })
  }

  return (
    <div className="flex justify-center w-full">
      <div className="flex flex-col w-full max-w-lg gap-6">
        <p className="eyebrow mr-auto">Set Password</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-6">
              <div className="flex flex-col gap-1 mb-4">
                <ValidatedField
                  control={form.control}
                  name="password"
                  label="New Password"
                  type="password"
                  showPasswordButton
                  showFormError={false}
                  inputProps={{
                    onFocus: () => setShowRequirements(true),
                  }}
                />
                {showRequirements && (
                  <PasswordRequirements control={form.control} name="password" />
                )}
              </div>

              <ValidatedField
                control={form.control}
                name="confirmPassword"
                label="Confirm New Password"
                type="password"
                showPasswordButton
              />
            </div>

            <Button
              type="submit"
              disabled={setPasswordMutation.isPending}
              className="w-full"
            >
              {setPasswordMutation.isPending ? 'Saving...' : 'Set Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
