'use client'

// THE ADDRESS FORM. It renders and it submits; every decision in it moved to
// the API.
//
// WHAT LEFT. The "first address in a book is the default" rule (it was
// `mustBeDefault = isNewAddress && addresses.length === 0`, with a disabled
// switch enforcing it - the server applies it now whatever a client sends);
// the Google Places SDK and its 90-line parser; a second Google surface, the
// geocoder, called to re-find an address the picker had just resolved; and the
// hand-rolled `applyAddressFieldsToForm` / `verifyAddress` writers, which are
// `form.reset` over the patch the server hands back.
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Field, Form, FormField, FormItem, Switch, ValidatedField } from '@dorado/components'
import type { AddressBookEntry, PlaceLookup } from '@dorado/contracts'
import { useCreateAddress, useUpdateAddress } from '@dorado/client'

import { AddressFormValues, addressSchema, makeEmptyAddress } from '@/features/addresses/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { GoogleMapDisplay } from '@/shared/ui/GoogleMapDisplay'
import { StateComboboxField } from './StateSelect'
import { usePlacesAutocompleteController } from '@/features/addresses/hooks/useAutocomplete'
import { AddressSearchInput } from '@/features/addresses/ui/AutocompleteInput'

const US_CENTER = { lat: 39.8283, lng: -98.5795 }
const US_ZOOM = 3
const ADDRESS_ZOOM = 15

type EntryMode = 'auto' | 'manual'

// The entry as the form reads it. A new address has no entry at all.
const valuesOf = (entry: AddressBookEntry | null): AddressFormValues =>
  entry
    ? ({
        recipient_name: entry.user_address.recipient_name ?? '',
        label: entry.user_address.label ?? '',
        line_1: entry.address.line_1 ?? '',
        line_2: entry.address.line_2 ?? '',
        city: entry.address.city ?? '',
        state: entry.address.state ?? '',
        country: entry.address.country ?? 'United States',
        country_code: entry.address.country_code ?? 'US',
        zip: entry.address.zip ?? '',
        phone_number: entry.address.phone_number ?? '',
        default_shipping: entry.user_address.default_shipping,
      } as AddressFormValues)
    : makeEmptyAddress()

export default function AddressForm({
  entry,
  onSuccess,
}: {
  entry: AddressBookEntry | null
  onSuccess?: (entry: AddressBookEntry) => void
}) {
  const { closeDrawer } = useDrawerStore()

  const initialValues = useMemo(() => valuesOf(entry), [entry])

  const create = useCreateAddress()
  const update = useUpdateAddress()
  const isSaving = create.isPending || update.isPending

  const [formError, setFormError] = useState<string | null>(null)
  const [mode, setMode] = useState<EntryMode>(entry ? 'manual' : 'auto')
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    mode: 'onSubmit',
    defaultValues: initialValues,
  })

  // ONE WRITE PER PICK. The server resolved the components, so the form takes
  // the patch it was handed rather than reading a components array itself.
  const applyPlace = (place: PlaceLookup) => {
    form.setValue('line_1', place.line_1 ?? '', { shouldDirty: true, shouldValidate: true })
    form.setValue('line_2', place.line_2 ?? '', { shouldDirty: true, shouldValidate: true })
    form.setValue('city', place.city ?? '', { shouldDirty: true, shouldValidate: true })
    form.setValue('state', place.state ?? '', { shouldDirty: true, shouldValidate: true })
    form.setValue('zip', place.zip ?? '', { shouldDirty: true, shouldValidate: true })
    setCenter(
      place.latitude != null && place.longitude != null
        ? { lat: place.latitude, lng: place.longitude }
        : null
    )
  }

  const ac = usePlacesAutocompleteController({
    initialValue: entry?.address.line_1 ?? '',
    onPlaceSelected: applyPlace,
  })

  const clearAutoSelected = () => {
    ac.clear()
    applyPlace({
      line_1: null, line_2: null, city: null, state: null, zip: null,
      country: 'United States', country_code: 'US', phone_number: null,
      formatted_address: null, latitude: null, longitude: null,
    })
  }

  const handleSubmit = (values: AddressFormValues) => {
    setFormError(null)
    const body = {
      address: {
        line_1: values.line_1,
        line_2: values.line_2 ?? null,
        city: values.city,
        state: values.state,
        country: values.country,
        zip: values.zip,
        country_code: values.country_code,
        phone_number: values.phone_number,
      },
      user_address: {
        recipient_name: values.recipient_name,
        label: values.label ?? null,
        default_shipping: values.default_shipping ?? false,
      },
    }

    const settle = {
      onError: (error: Error) => {
        setFormError(error.message)
        setTimeout(() => setFormError(null), 5000)
      },
      onSuccess: (saved: AddressBookEntry) => {
        onSuccess?.(saved)
        closeDrawer()
      },
    }

    if (entry) update.mutate({ address_id: entry.address.id, body }, settle)
    else create.mutate(body, settle)
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">{entry ? 'Edit Address' : 'Add New Address'}</p>
          </div>

          <ValidatedField
            control={form.control}
            name="recipient_name"
            label="Recipient"
            type="text"
            inputProps={{
              inputMode: 'text',
              autoComplete: 'name',
              placeholder: 'Who receives the parcel',
            }}
          />

          <ValidatedField
            control={form.control}
            name="label"
            label="Nickname"
            type="text"
            inputProps={{
              inputMode: 'text',
              autoComplete: 'off',
              placeholder: 'Home',
            }}
          />

          <ValidatedField
            control={form.control}
            name="phone_number"
            label="Phone Number"
            type="text"
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
          />

          {mode === 'auto' ? (
            <>
              <Field label="Find Address" className="w-full">
                <AddressSearchInput
                  value={ac.searchText}
                  suggestions={ac.suggestions}
                  busy={ac.isResolving}
                  onChangeValue={ac.onChangeValue}
                  onSelect={ac.selectSuggestion}
                  onClear={clearAutoSelected}
                />
              </Field>
              <div className="overflow-hidden rounded-lg border border-border">
                <GoogleMapDisplay
                  center={center ?? US_CENTER}
                  zoom={center ? ADDRESS_ZOOM : US_ZOOM}
                  height={225}
                  markers={
                    center ? [{ id: 'selected', position: center, title: 'Selected Address' }] : []
                  }
                />
              </div>
            </>
          ) : (
            <>
              <ValidatedField
                control={form.control}
                name="line_1"
                label="Line 1"
                type="text"
                inputProps={{
                  inputMode: 'text',
                  autoComplete: 'address-line1',
                  placeholder: '123 Main St',
                }}
              />

              <ValidatedField
                control={form.control}
                name="line_2"
                label="Line 2"
                type="text"
                inputProps={{
                  inputMode: 'text',
                  autoComplete: 'address-line2',
                  placeholder: 'Apt 4B',
                }}
              />

              <div className="grid grid-cols-2 gap-1">
                <ValidatedField
                  control={form.control}
                  name="city"
                  label="City"
                  inputProps={{
                    inputMode: 'text',
                    autoComplete: 'address-level2',
                    placeholder: 'Phoenix',
                  }}
                />

                <StateComboboxField
                  control={form.control}
                  name="state"
                  label="State"
                  placeholder="Select a state…"
                />
              </div>

              <div className="grid grid-cols-2 gap-1">
                <ValidatedField
                  control={form.control}
                  name="zip"
                  label="Zip"
                  type="text"
                  inputProps={{
                    inputMode: 'numeric',
                    autoComplete: 'postal-code',
                    placeholder: '85001',
                  }}
                />

                <ValidatedField
                  control={form.control}
                  name="country"
                  label="Country"
                  type="text"
                  inputProps={{
                    readOnly: true,
                    autoComplete: 'country',
                    placeholder: 'United States',
                  }}
                />
              </div>
            </>
          )}

          <div className="flex items-end justify-between w-full">
            {/* THE DEFAULT SWITCH ONLY EVER TURNS ONE ON. `actions.set_default`
                is the server's answer to "may this become the default", and an
                address stops being one by another becoming it. */}
            <FormField
              control={form.control}
              name="default_shipping"
              render={({ field }) => (
                <FormItem className="w-full">
                  <Field label="Default Address">
                    <Switch
                      checked={!!field.value}
                      disabled={!!entry && !entry.actions.set_default}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => setMode(mode === 'manual' ? 'auto' : 'manual')}
            >
              {mode === 'manual' ? 'Search for Address' : 'Manual Entry'}
            </Button>
          </div>

          {formError && <p className="mb-1 text-left text-destructive">{formError}</p>}

          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? 'Saving...' : entry ? 'Save Address' : 'Save New Address'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
