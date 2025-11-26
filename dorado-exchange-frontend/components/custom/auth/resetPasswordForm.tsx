'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useResetPassword } from '@/lib/queries/useAuth'
import { ResetPassword, resetPasswordSchema } from '@/types/auth'
import { ValidatedField } from '@/components/ui/validated_field'
import { PasswordRequirements } from './passwordRequirements'

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
        <p className="text-xs text-neutral-600 tracking-widest mr-auto uppercase">Reset Password</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-6">
              <div className="flex flex-col gap-1 mb-4">
                <ValidatedField
                  control={form.control}
                  name="password"
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  showPasswordButton
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  showOnTouch={true}
                  showFormError={false}
                  showIcon={false}
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
                type={showConfirmPassword ? 'text' : 'password'}
                showPasswordButton
                showPassword={showConfirmPassword}
                setShowPassword={setShowConfirmPassword}
                showOnTouch={true}
                showIcon={false}
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={resetPasswordMutation.isPending}
              className="w-full text-white raised-off-page bg-primary hover:bg-primary"
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
