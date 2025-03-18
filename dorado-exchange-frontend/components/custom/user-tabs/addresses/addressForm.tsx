'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StateSelect } from '../account/stateSelect'

import { Address, addressSchema } from '@/types/address'
import { useUpdateAddress } from '@/lib/queries/useAddresses'
import { Asterisk } from 'lucide-react'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

export default function AddressForm({
  address,
  setOpen,
}: {
  address: Address
  setOpen: (open: boolean) => void
}) {
  const updateAddressMutation = useUpdateAddress()

  const handleAddressSubmit = (values: Address) => {
    updateAddressMutation.mutate(values, {
      onSettled: () => {
        setOpen(false)
      },
    })
  }

  const addressForm = useForm<Address>({
    resolver: zodResolver(addressSchema),
    mode: 'onSubmit',
    defaultValues: address,
    values: address,
  })

  const formatPhoneNumber = (value: string) => {
    if (!value) return ''

    const digits = value.replace(/\D/g, '')

    const cleanDigits = digits.startsWith('1') ? digits.slice(1) : digits

    if (cleanDigits.length <= 3) return `(${cleanDigits}`
    if (cleanDigits.length <= 6) return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3)}`
    return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3, 6)} - ${cleanDigits.slice(6, 10)}`
  }

  return (
    <div>
      <Form {...addressForm}>
        <form onSubmit={addressForm.handleSubmit(handleAddressSubmit)} className="space-y-4">
          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="name"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Name"
                        type="name"
                        autoComplete="name"
                        size="xs"
                        className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>
                    <Asterisk
                      size={20}
                      className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                    />
                  </div>
                  {addressForm.formState.errors.name && (
                    <p className="text-red-500 text-sm">
                      {addressForm.formState.errors.name.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Phone Number"
                        type="text"
                        autoComplete="tel"
                        size="xs"
                        className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        maxLength={17}
                        {...field}
                        value={formatPhoneNumber(field.value)}
                        onChange={(e) => {
                          let digits = e.target.value.replace(/\D/g, '')

                          if (!digits.startsWith('1')) {
                            digits = '1' + digits
                          }

                          digits = digits.slice(0, 11)

                          field.onChange(`+${digits}`)
                        }}
                        
                      />
                    </FormControl>
                    <Asterisk
                      size={20}
                      className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                    />
                  </div>
                  {addressForm.formState.errors.name && (
                    <p className="text-red-500 text-sm">
                      {addressForm.formState.errors.name.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="line_1"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Address Line 1"
                        type="text"
                        autoComplete="address-line1"
                        size="xs"
                        className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>
                    <Asterisk
                      size={20}
                      className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                    />
                  </div>
                  {addressForm.formState.errors.line_1 && (
                    <p className="text-red-500 text-sm">
                      {addressForm.formState.errors.line_1.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="line_2"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="relative w-full">
                      <FormControl>
                        <FloatingLabelInput
                          label="Address Line 2"
                          type="text"
                          autoComplete="address-line2"
                          size="xs"
                          className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    {addressForm.formState.errors.line_2 && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.line_2.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={addressForm.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="relative w-full">
                      <FormControl>
                        <FloatingLabelInput
                          label="City"
                          type="text"
                          autoComplete="address-level2"
                          size="xs"
                          className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                          {...field}
                        />
                      </FormControl>
                      <Asterisk
                        size={20}
                        className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                      />
                    </div>
                    {addressForm.formState.errors.city && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.city.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="zip"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="relative w-full">
                      <FormControl>
                        <FloatingLabelInput
                          label="Zip"
                          type="text"
                          autoComplete="postal-code"
                          size="xs"
                          className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                          {...field}
                        />
                      </FormControl>
                      <Asterisk
                        size={20}
                        className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                      />
                    </div>
                    {addressForm.formState.errors.zip && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.zip.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={addressForm.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <StateSelect value={field.value} onChange={field.onChange} />
                    {addressForm.formState.errors.state && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.state.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="country"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Country"
                        type="text"
                        autoComplete="country"
                        size="xs"
                        readOnly
                        className="bg-background placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>
                    <Asterisk
                      size={20}
                      className="ml-auto text-destructive absolute right-3 top-1/2 -translate-y-1/2 "
                    />
                  </div>
                  {addressForm.formState.errors.country && (
                    <p className="text-red-500 text-sm">
                      {addressForm.formState.errors.country.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>
          <Button
            type="submit"
            className="w-full mb-8 shadow-lg"
            disabled={updateAddressMutation.isPending}
          >
            {updateAddressMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
