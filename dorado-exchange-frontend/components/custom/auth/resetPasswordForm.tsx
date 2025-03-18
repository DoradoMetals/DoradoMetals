'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { Logo } from '@/components/icons/logo'
import { useResetPassword } from '@/lib/queries/useAuth' // Import the TanStack mutation
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

const formSchema = z
  .object({
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') // Extract token directly
  const [showPassword, setShowPassword] = useState(false)

  const resetPasswordMutation = useResetPassword() // Use TanStack Mutation

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!token) {
      return form.setError('password', { type: 'manual', message: 'Invalid or missing token.' })
    }

    resetPasswordMutation.mutate(
      { newPassword: values.password, token },
      {
        onSuccess: () => {
          form.reset() // Reset the form after successful password reset
          router.push('/authentication?tab=sign-in?resetSuccess=true')
        },
      }
    )
  }

  return (
    <div className="h-screen grid place-items-center">
      <div className="flex flex-col w-full max-w-sm px-5">
        <div className="flex items-center mb-10">
          <div className="mr-auto">
            <Link href={'/'}>
              <Logo size={50} />
            </Link>
          </div>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>

        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Reset Password</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        size="xs"
                        className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        size="xs"
                        className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="default"
              disabled={resetPasswordMutation.isPending}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6"
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </Form>

        {resetPasswordMutation.error && (
          <p className="text-sm text-center text-red-500">{resetPasswordMutation.error.message}</p>
        )}
        {resetPasswordMutation.isSuccess && (
          <p className="text-sm text-center text-green-500">Password reset successful!</p>
        )}
      </div>
    </div>
  )
}
