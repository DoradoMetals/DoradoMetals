'use client'

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
import { useSignUp } from '@/lib/queries/useAuth'
import orSeparator from './orSeparator'
import { useState } from 'react'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { SignUp, signUpSchema } from '@/types/auth'
import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import ShowPasswordButton from './showPasswordButton'
import GoogleButton from './googleButton'

export default function SignUpForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const { mutate: signUpMutation, error, isPending } = useSignUp()

  const form = useForm<SignUp>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', name: '', terms: false },
  })

  const handleSubmit = (values: SignUp) => {
    signUpMutation(
      {
        email: values.email,
        password: values.password,
        name: values.name,
      },
      {
        onSuccess: () => {
          router.push('/')
        },
      }
    )
  }

  return (
    <div className="grid place-items-center pb-20">
      <div className="flex flex-col w-full">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Name"
                      type="name"
                      autoComplete="name"
                      size="sm"
                      className="input-floating-label-form "
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />

                    <FormControl>
                      <FloatingLabelInput
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
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

            <div className="flex justify-between items-center w-full">
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem className="flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          id="terms-checkbox"
                          className="checkbox-form"
                        />
                      </FormControl>
                      <FormLabel htmlFor="terms-checkbox" className="cursor-pointer">
                        <div className="flex items-end text-xs text-neutral-600 gap-1">
                          Accept our
                          <Link
                            className="text-primary-gradient tracking-wide"
                            href={'/terms-and-conditions'}
                          >
                            Terms and Condtions
                          </Link>
                          and
                          <Link className="text-primary-gradient tracking-wide" href={'/privacy-policy'}>
                            Privacy Policy.
                          </Link>
                        </div>
                      </FormLabel>
                    </div>
                    <FormMessage className="error-text" />
                  </FormItem>
                )}
              />
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
              {isPending ? 'Signing Up...' : 'Sign Up'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        <GoogleButton buttonLabel={'Sign Up with Google'} />
      </div>
    </div>
  )
}
