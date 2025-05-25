'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { StateSelect } from '../account/stateSelect'

import { Address, addressSchema } from '@/types/address'
import { useUpdateAddress } from '@/lib/queries/useAddresses'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'

export default function AddressForm({
  address,
  onSuccess,
}: {
  address: Address
  onSuccess?: (address: Address) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const updateAddressMutation = useUpdateAddress()

  const { closeDrawer } = useDrawerStore()

  const handleAddressSubmit = (values: Address) => {
    setFormError(null)

    updateAddressMutation.mutate(values, {
      onError: (error: any) => {
        const message =
          error?.response?.data?.message || error?.message || 'Failed to update address.'
        setFormError(message)

        setTimeout(() => {
          setFormError(null)
        }, 5000)
      },
      onSuccess: (updatedAddressFromServer) => {
        onSuccess?.(updatedAddressFromServer)
        closeDrawer()
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Name"
                      type="name"
                      autoComplete="name"
                      size="sm"
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Phone Number"
                      type="text"
                      inputMode="tel"
                      autoComplete="tel"
                      size="sm"
                      className="input-floating-label-form"
                      maxLength={17}
                      {...field}
                      value={formatPhoneNumber(field.value)}
                      onChange={(e) => {
                        let digits = e.target.value.replace(/\D/g, '')
                        if (digits.length === 11 && digits.startsWith('1')) {
                          digits = digits.slice(1)
                        }
                        field.onChange(digits.slice(0, 10))
                      }}
                    />
                  </FormControl>
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Address Line 1"
                      type="text"
                      autoComplete="address-line1"
                      size="sm"
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                    </div>
                    <FormControl>
                      <FloatingLabelInput
                        label="Address Line 2"
                        type="text"
                        autoComplete="address-line2"
                        size="sm"
                        className="input-floating-label-form"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={addressForm.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="relative w-full">
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                    </div>
                    <FormControl>
                      <FloatingLabelInput
                        label="City"
                        type="text"
                        autoComplete="address-level2"
                        size="sm"
                        className="input-floating-label-form"
                        {...field}
                      />
                    </FormControl>
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                    </div>
                    <FormControl>
                      <FloatingLabelInput
                        label="Zip"
                        type="number"
                        pattern="[0-9]*"
                        autoComplete="postal-code"
                        size="sm"
                        className="input-floating-label-form"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={addressForm.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative w-full">
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                    </div>
                    <StateSelect value={field.value} onChange={field.onChange} />
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Country"
                      type="text"
                      autoComplete="country"
                      size="sm"
                      readOnly
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {formError && (
            <div className="text-xs text-destructive font-normal mb-1 text-left">{formError}</div>
          )}
          <Button
            type="submit"
            className="form-submit-button liquid-gold raised-off-page shine-on-hover !mb-0"
            disabled={updateAddressMutation.isPending}
          >
            {updateAddressMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
