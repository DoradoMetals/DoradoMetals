'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

import { Address, addressSchema } from '@/features/addresses/types'
import { useCreateAddress, useUpdateAddress } from '@/features/addresses/queries'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { useState } from 'react'
import { useDrawerStore } from '@/store/drawerStore'
import formatPhoneNumber, { normalizePhone } from '@/utils/formatting/formatPhoneNumber'
import { StateSelect } from '@/features/addresses/ui/StateSelect'

export default function AddressForm({
  address,
  onSuccess,
}: {
  address: Address
  onSuccess?: (address: Address) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)

  const createAddressMutation = useCreateAddress()
  const updateAddressMutation = useUpdateAddress()
  const isSaving = createAddressMutation.isPending || updateAddressMutation.isPending

  const { closeDrawer } = useDrawerStore()

  const handleAddressSubmit = (values: Address) => {
    setFormError(null)

    const mutation = values?.id ? updateAddressMutation : createAddressMutation
    const fallbackMsg = values?.id ? 'Failed to update address.' : 'Failed to create address.'

    mutation.mutate(values, {
      onError: (error: any) => {
        const message = error?.response?.data?.message || error?.message || fallbackMsg
        setFormError(message)
        setTimeout(() => setFormError(null), 5000)
      },
      onSuccess: (savedAddressFromServer: Address) => {
        onSuccess?.(savedAddressFromServer)
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                        field.onChange(normalizePhone(e.target.value))
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                      <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2" />
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
            className="w-full text-white raised-off-page bg-primary hover:bg-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
