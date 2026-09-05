'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Form, ValidatedField } from '@dorado/components'
import { useResetPassword } from '@/features/auth/queries'
import { ResetPassword, resetPasswordSchema } from '@/features/auth/types'
import { PasswordRequirements } from './PasswordRequirements'

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [showRequirements, setShowRequirements] = useState(false)

  const resetPasswordMutation = useResetPassword()

  const form = useForm<ResetPassword>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: ResetPassword) => {
    if (!token) {
      return form.setError('password', { type: 'manual', message: 'Invalid or missing token.' })
    }

    resetPasswordMutation.mutate(
      { newPassword: values.password, token },
      {
        onSuccess: () => {
          form.reset()
          router.push('/authentication')
        },
      }
    )
  }

  return (
    <div className="flex justify-center w-full">
      <div className="flex flex-col w-full max-w-lg gap-6">
        <p className="eyebrow mr-auto">Reset Password</p>
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
              disabled={resetPasswordMutation.isPending}
              className="w-full"
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
