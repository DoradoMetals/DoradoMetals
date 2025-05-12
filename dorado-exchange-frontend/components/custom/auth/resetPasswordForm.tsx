'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useResetPassword } from '@/lib/queries/useAuth'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { ResetPassword, resetPasswordSchema } from '@/types/auth'
import ShowPasswordButton from './showPasswordButton'

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
          router.push('/authentication?tab=sign-in&resetSuccess=true')
        },
      }
    )
  }

  return (
    <div className="h-screen mt-12 lg:mt-32 flex justify-center">
      <div className="flex flex-col w-full max-w-sm px-4">
        <p className="text-lg text-neutral-600 font-bold mr-auto mb-10">Reset Password</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-10">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative w-full">
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                      <FormControl>
                        <FloatingLabelInput
                          label="New Password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          size="sm"
                          className="input-floating-label-form"
                          {...field}
                        />
                      </FormControl>
                      <ShowPasswordButton
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                      />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative w-full">
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                      <FormControl>
                        <FloatingLabelInput
                          label="Confirm New Password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          size="sm"
                          className="input-floating-label-form"
                          {...field}
                        />
                      </FormControl>
                      <ShowPasswordButton
                        showPassword={showConfirmPassword}
                        setShowPassword={setShowConfirmPassword}
                      />
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={resetPasswordMutation.isPending}
              className="form-submit-button liquid-gold raised-off-page shine-on-hover"
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </Form>

        {resetPasswordMutation.error && (
          <p className="text-sm text-center text-destructive">
            {resetPasswordMutation.error.message}
          </p>
        )}
        {resetPasswordMutation.isSuccess && (
          <p className="text-sm text-center text-green-500">Password reset successful!</p>
        )}
      </div>
    </div>
  )
}
