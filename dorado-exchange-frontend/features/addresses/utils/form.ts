import type { UseFormReturn } from 'react-hook-form'
import type { Address } from '@/features/addresses/types'

type AddressForm = UseFormReturn<Address>

export function verifyAddress(form: AddressForm, value: boolean) {
  const v = form.getValues() as any
  if ('is_valid' in v) {
    form.setValue('is_valid' as any, value as any, { shouldDirty: true, shouldValidate: true })
  }
}

export function applyAddressFieldsToForm(
  form: AddressForm,
  fields: Pick<Address, 'line_1' | 'city' | 'state' | 'zip' | 'country'> & { line_2?: string }
) {
  form.setValue('line_1', fields.line_1 ?? '', { shouldDirty: true, shouldValidate: true })
  form.setValue('line_2', fields.line_2 ?? '', { shouldDirty: true, shouldValidate: true })
  form.setValue('city', fields.city ?? '', { shouldDirty: true, shouldValidate: true })
  form.setValue('state', fields.state ?? '', { shouldDirty: true, shouldValidate: true })
  form.setValue('zip', fields.zip ?? '', { shouldDirty: true, shouldValidate: true })
  form.setValue('country', (fields.country ?? 'United States') as any, {
    shouldDirty: true,
    shouldValidate: true,
  })
}

export function clearAddressFields(form: AddressForm) {
  applyAddressFieldsToForm(form, {
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
  })
  verifyAddress(form, false)
}
