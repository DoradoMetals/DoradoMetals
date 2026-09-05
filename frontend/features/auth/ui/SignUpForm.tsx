'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, ValidatedField } from '@dorado/components'
import { Checkbox } from '@dorado/components'
import Link from 'next/link'
import { useSignUp } from '@/features/auth/queries'
import { SignUp, signUpSchema } from '@/features/auth/types'
import { PasswordRequirements } from './PasswordRequirements'
import orSeparator from './OrSeparator'
import GoogleButton from './GoogleSignInButton'
import { verifyRecaptcha } from './VerifyRecaptcha'

export default function SignUpForm() {
  const router = useRouter()
  const [showRequirements, setShowRequirements] = useState(false)

  const { run: checkCaptcha, isPending: recaptchaPending } = verifyRecaptcha('sign_up')
  const { mutate: signUpMutation, error, isPending: signUpPending } = useSignUp()

  const form = useForm<SignUp>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', name: '', terms: false },
    mode: 'onBlur',
  })

  const handleSubmit = async (values: SignUp) => {
    const human = await checkCaptcha()
    if (!human) {
      console.warn('Bot detected')
      return
    }
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
      <div className="flex flex-col w-full max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            <ValidatedField
              control={form.control}
              name="name"
              label="Name"
              type="text"
            />

            <ValidatedField
              control={form.control}
              name="email"
              label="Email"
              type="email"
            />

            <div className="flex flex-col gap-1">
              <ValidatedField
                control={form.control}
                name="password"
                label="Password"
                type="password"
                showPasswordButton
                showFormError={false}
                inputProps={{ onFocus: () => setShowRequirements(true) }}
              />
              {showRequirements && <PasswordRequirements control={form.control} name="password" />}
            </div>
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
                        />
                      </FormControl>
                      <FormLabel htmlFor="terms-checkbox" className="cursor-pointer">
                        <span className="flex items-end gap-1">
                          Accept our
                          <Link className="text-primary" href={'/terms-and-conditions'}>
                            Terms and Condtions
                          </Link>
                          and
                          <Link className="text-primary" href={'/privacy-policy'}>
                            Privacy Policy.
                          </Link>
                        </span>
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-destructive">{error ? error.message : null}</p>

            <Button
              type="submit"
              disabled={recaptchaPending || signUpPending}
              className="w-full mb-8"
            >
              {recaptchaPending ? 'Verifying…' : signUpPending ? 'Signing Up…' : 'Sign Up'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        <GoogleButton buttonLabel={'Sign Up with Google'} />
      </div>
    </div>
  )
}
