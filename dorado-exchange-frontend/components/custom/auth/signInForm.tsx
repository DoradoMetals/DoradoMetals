'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { ForgotPasswordDialog } from './forgotPasswordDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useSignIn } from '@/lib/queries/useAuth'

import orSeparator from './orSeparator'
import googleButton from './googleButton'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { SignIn, signInSchema } from '@/types/auth'
import ShowPasswordButton from './showPasswordButton'

export default function SignInForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const { mutate: signInMutation, error, isPending } = useSignIn()

  const form = useForm<SignIn>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  const onSubmit = (values: SignIn) => {
    signInMutation(values, {
      onSuccess: () => {
        router.push('/')
      },
    })
  }

  return (
    <div className="grid place-items-center mt-6">
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-center mb-10">
          <h2 className="title-text">Welcome Back!</h2>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="mb-10">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative w-full">
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                    </div>
                    <FormControl>
                      <FloatingLabelInput
                        label="Email"
                        type="email"
                        autoComplete="email"
                        size="sm"
                        className="input-floating-label-form"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="mb-2">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="relative w-full">
                      <div className="relative w-full">
                        <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                      </div>
                      <FormControl>
                        <FloatingLabelInput
                          label="Password"
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
            </div>

            <div className="flex justify-between items-center w-full mt-2">
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-1">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="remember-me"
                        className="checkbox-form"
                      />
                    </FormControl>
                    <FormLabel htmlFor="remember-me" className="secondary-text cursor-pointer pb-1">
                      Remember Me
                    </FormLabel>
                  </FormItem>
                )}
              />
              <ForgotPasswordDialog />
            </div>

            <div className="flex mb-0 p-0 error-text ml-auto">
              <p className="ml-auto">{error ? error.message : null}</p>
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={isPending}
              className="form-submit-button"
            >
              {isPending ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        {googleButton('Sign In with Google')}
      </div>
    </div>
  )
}
