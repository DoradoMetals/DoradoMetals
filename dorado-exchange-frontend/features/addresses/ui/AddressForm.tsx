'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem } from '@/shared/ui/base/form'
import { Button } from '@/shared/ui/base/button'
import { Switch } from '@/shared/ui/base/switch'

import { Address, addressSchema, makeEmptyAddress } from '@/features/addresses/types'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { useGetSession } from '@/features/auth/queries'

import { ValidatedField } from '@/shared/ui/form/ValidatedField'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'


import { formatAddressSearchText, placeToAddressFields } from '../utils/places'
import { applyAddressFieldsToForm, clearAddressFields, verifyAddress } from '../utils/form'
import { GoogleMapDisplay } from '@/shared/ui/GoogleMapDisplay'
import { Label } from '@/shared/ui/base/label'
import { StateComboboxField } from './StateSelect'
import { useAddress, useCreateAddress, useUpdateAddress } from '@/features/addresses/queries'
import { useGeocodeAddress } from '@/features/addresses/hooks/useGeocoder'
import { usePlacesAutocompleteController } from '@/features/addresses/hooks/useAutocomplete'
import { AddressSearchInput } from '@/features/addresses/ui/AutocompleteInput'

const US_CENTER = { lat: 39.8283, lng: -98.5795 }
const US_ZOOM = 3
const ADDRESS_ZOOM = 15

type EntryMode = 'auto' | 'manual'

export default function AddressForm({
  address,
  onSuccess,
}: {
  address: Address | null
  onSuccess?: (address: Address) => void
}) {
  const { user } = useGetSession()
  const { closeDrawer } = useDrawerStore()
  const { data: addresses = [] } = useAddress()

  const empty = useMemo(() => makeEmptyAddress(user?.id), [user?.id])

  const createAddressMutation = useCreateAddress()
  const updateAddressMutation = useUpdateAddress()
  const isSaving = createAddressMutation.isPending || updateAddressMutation.isPending

  const [formError, setFormError] = useState<string | null>(null)

  const initialMode: EntryMode = address?.id ? 'manual' : 'auto'

  const form = useForm<Address>({
    resolver: zodResolver(addressSchema),
    mode: 'onSubmit',
    defaultValues: address ?? empty,
  })

  const [mode, setMode] = useState<EntryMode>(initialMode)
  const [mapQuery, setMapQuery] = useState<string>(formatAddressSearchText(address ?? empty))

  const shouldGeocode = mode === 'auto' && !!mapQuery.trim()

  const { center } = useGeocodeAddress({
    enabled: shouldGeocode,
    query: mapQuery,
    debounceMs: 250,
  })

  const ac = usePlacesAutocompleteController({
    userId: user?.id,
    initialValue: formatAddressSearchText(address ?? empty),
    onPlaceSelected: ({ place }) => {
      const fields = placeToAddressFields(place)
      if (!fields) return

      applyAddressFieldsToForm(form, fields)
      verifyAddress(form, true)
      setMode('auto')

      const addressText = `${fields.line_1}, ${fields.city}, ${fields.state} ${fields.zip}, United States`
      setMapQuery(addressText)
    },
  })

  const isNewAddress = !address?.id
  const mustBeDefault = isNewAddress && addresses.length === 0

  const handleSubmit = (values: Address) => {
    setFormError(null)

    const submitValues = mustBeDefault ? { ...values, is_default: true } : values

    const mutation = submitValues?.id ? updateAddressMutation : createAddressMutation
    const fallbackMsg = submitValues?.id ? 'Failed to update address.' : 'Failed to create address.'

    mutation.mutate(submitValues, {
      onError: (error: any) => {
        const message = error?.response?.data?.message || error?.message || fallbackMsg
        setFormError(message)
        setTimeout(() => setFormError(null), 5000)
      },
      onSuccess: (saved: Address) => {
        onSuccess?.(saved)
        closeDrawer()
      },
    })
  }

  const clearAutoSelected = () => {
    ac.clear()
    clearAddressFields(form)
    setMapQuery('')
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600 tracking-widest">
              {!!address?.id ? 'Edit Address' : 'Add New Address'}
            </div>
          </div>

          <ValidatedField
            control={form.control}
            name="name"
            label="Address Name"
            type="text"
            className="bg-highest border-1 border-border"
            inputProps={{
              inputMode: 'text',
              autoComplete: 'name',
              placeholder: 'Home',
            }}
            showIcon={false}
            floating={false}
          />

          <ValidatedField
            control={form.control}
            name="phone_number"
            label="Phone Number"
            type="text"
            className="bg-highest border-1 border-border"
            showIcon={false}
            inputProps={{
              placeholder: '(555) 555-5555',
              inputMode: 'tel',
              autoComplete: 'tel',
              maxLength: 17,
              value: formatPhoneNumber(form.watch('phone_number') ?? ''),
              onChange: (e) => {
                form.setValue('phone_number', normalizePhone(e.target.value), {
                  shouldTouch: true,
                  shouldDirty: true,
                  shouldValidate: false,
                })
              },
            }}
            floating={false}
          />

          {mode === 'auto' ? (
            <>
              <div className="w-full space-y-1">
                <Label className="text-xs text-neutral-700">Find Address</Label>

                <AddressSearchInput
                  placesReady={ac.placesReady}
                  value={ac.searchText}
                  suggestions={ac.suggestions}
                  dropdownOpen={ac.dropdownOpen}
                  activeIndex={ac.activeIndex}
                  onChangeValue={(v) => {
                    ac.onChangeValue(v)
                    setMapQuery(v)
                  }}
                  onOpen={ac.open}
                  onClose={ac.close}
                  onActiveIndex={ac.setActiveIndex}
                  onSelect={ac.selectSuggestion}
                  onClear={clearAutoSelected}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <GoogleMapDisplay
                  center={center ?? US_CENTER}
                  zoom={center ? ADDRESS_ZOOM : US_ZOOM}
                  height={225}
                  markers={
                    center ? [{ id: 'selected', position: center, title: 'Selected Address' }] : []
                  }
                />

                {/* address verification goes here, maybe have like 'input address/address verified/address not verified idk' */}
              </div>
            </>
          ) : (
            <>
              <ValidatedField
                control={form.control}
                name="line_1"
                label="Line 1"
                className="bg-highest border-1 border-border"
                type="text"
                inputProps={{
                  inputMode: 'text',
                  autoComplete: 'address-line1',
                  placeholder: '123 Main St',
                }}
                showIcon={false}
                floating={false}
              />

              <ValidatedField
                control={form.control}
                name="line_2"
                label="Line 2"
                className="bg-highest border-1 border-border"
                type="text"
                inputProps={{
                  inputMode: 'text',
                  autoComplete: 'address-line2',
                  placeholder: 'Apt 4B',
                }}
                showIcon={false}
                floating={false}
              />

              <div className="grid grid-cols-2 gap-1">
                <ValidatedField
                  control={form.control}
                  name="city"
                  label="City"
                  className="bg-highest border-1 border-border"
                  inputProps={{
                    inputMode: 'text',
                    autoComplete: 'address-level2',
                    placeholder: 'Phoenix',
                  }}
                  showIcon={false}
                  floating={false}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <StateComboboxField
                      control={form.control}
                      name="state"
                      label="State"
                      placeholder="Select a state…"
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-1">
                <ValidatedField
                  control={form.control}
                  name="zip"
                  label="Zip"
                  className="bg-highest border-1 border-border"
                  type="text"
                  showIcon={false}
                  inputProps={{
                    inputMode: 'numeric',
                    autoComplete: 'postal-code',
                    placeholder: '85001',
                  }}
                  floating={false}
                />

                <ValidatedField
                  control={form.control}
                  name="country"
                  label="Country"
                  className="bg-highest border-1 border-border"
                  type="text"
                  showIcon={false}
                  inputProps={{
                    readOnly: true,
                    autoComplete: 'country',
                    placeholder: 'United States',
                  }}
                  floating={false}
                />
              </div>
            </>
          )}

          <div className="flex items-end justify-between w-full">
            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="space-y-1">
                    <Label className="text-xs text-neutral-700">Default Address</Label>
                    <Switch
                      checked={mustBeDefault ? true : !!field.value}
                      disabled={mustBeDefault}
                      onCheckedChange={(v) => {
                        if (mustBeDefault) return
                        field.onChange(v)
                      }}
                    />{' '}
                  </div>
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="link"
              onClick={() => setMode(mode === 'manual' ? 'auto' : 'manual')}
              className="text-xs md:text-sm p-0 text-neutral-800"
            >
              {mode === 'manual' ? 'Search for Address' : 'Manual Entry'}
            </Button>
          </div>

          {formError && (
            <div className="text-xs text-destructive font-normal mb-1 text-left">{formError}</div>
          )}

          <Button
            type="submit"
            className="w-full text-white raised-off-page bg-primary hover:bg-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : !!address?.id ? 'Save Address' : 'Save New Address'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
