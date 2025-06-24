'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { ForgotPasswordDialog } from './forgotPasswordDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useSignIn } from '@/lib/queries/useAuth'

import orSeparator from './orSeparator'
import { SignIn, signInSchema } from '@/types/auth'
import GoogleButton from './googleButton'
import { ValidatedField } from '@/components/ui/validated_field'

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false)
  const { mutate: signInMutation, error, isPending } = useSignIn()

  const form = useForm<SignIn>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  const onSubmit = (values: SignIn) => {
    signInMutation(values)
  }

  return (
    <div className="grid place-items-center pb-20">
      <div className="flex flex-col w-full">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <ValidatedField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              showOnTouch={true}
            />

            <div className="mb-2">
              <ValidatedField
                control={form.control}
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                showPasswordButton
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                showOnTouch={true}
                showFormError={false}
                showIcon={false}
              />
            </div>

            <div className="flex justify-between items-center w-full">
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex items-end gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="remember-me"
                        className="checkbox-form"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="remember-me"
                      className="text-neutral-600 text-xs cursor-pointer"
                    >
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
              className="form-submit-button liquid-gold raised-off-page shine-on-hover text-white"
            >
              {isPending ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        <GoogleButton buttonLabel={'Sign In with Google'} />
      </div>
    </div>
  )
}
