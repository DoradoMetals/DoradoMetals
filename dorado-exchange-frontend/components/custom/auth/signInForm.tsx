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
import { verifyRecaptcha } from './verifyRecaptcha'

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false)

  const { run: checkCaptcha, isPending: recaptchaPending } = verifyRecaptcha('sign_in')
  const { mutate: signInMutation, error, isPending: signInPending } = useSignIn()

  const form = useForm<SignIn>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  const onSubmit = async (values: SignIn) => {
    const human = await checkCaptcha()
    if (!human) {
      console.warn('Bot detected')
      return
    }
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

            <div className="flex mb-0 p-0 text-xs text-destructive ml-auto">
              <p className="ml-auto">{error ? error.message : null}</p>
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={recaptchaPending || signInPending}
              className="bg-primary raised-off-page text-white w-full mb-8"
            >
              {recaptchaPending ? 'Verifying…' : signInPending ? 'Signing In…' : 'Sign In'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        <GoogleButton buttonLabel={'Sign In with Google'} />
      </div>
    </div>
  )
}
