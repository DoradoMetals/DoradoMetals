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
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { useSignUp } from '@/lib/queries/useAuth'
import { SignUp, signUpSchema } from '@/types/auth'
import { ValidatedField } from '@/components/ui/validated_field'
import { PasswordRequirements } from './passwordRequirements'
import orSeparator from './orSeparator'
import GoogleButton from './googleButton'

export default function SignUpForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showRequirements, setShowRequirements] = useState(false)
  const { mutate: signUpMutation, error, isPending } = useSignUp()

  const form = useForm<SignUp>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', name: '', terms: false },
    mode: 'onBlur',
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
      <div className="flex flex-col w-full max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            <ValidatedField
              control={form.control}
              name="name"
              label="Name"
              type="text"
              showOnTouch={true}
            />

            <ValidatedField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              showOnTouch={true}
            />

            <div className="flex flex-col gap-1">
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
                          <Link
                            className="text-primary-gradient tracking-wide"
                            href={'/privacy-policy'}
                          >
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

            <div className="text-red-600 text-sm">{error ? error.message : null}</div>

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
