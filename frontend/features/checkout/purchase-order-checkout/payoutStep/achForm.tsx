'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Form, FormControl } from '@/shared/ui/base/form'
import { AchPayout } from '@/features/payouts/types'
import { UseFormReturn } from 'react-hook-form'
import { usePayoutDraft } from '@/features/checkout/purchase-order-checkout/payoutStep/payoutDraft'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'
import { FormField, FormItem } from '@/shared/ui/base/form'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import { accountTypeOptions } from '@/features/payouts/types'
import { cn } from '@/shared/utils/cn'
import { Checkbox } from '@dorado/components'

export default function ACHForm({
  form,
  visible,
}: {
  form: UseFormReturn<AchPayout>
  visible: boolean
}) {
  const setPayout = usePayoutDraft((state) => state.setPayout)

  const syncToStore = () => {
    const values = form.getValues()
    setPayout({ method: 'ACH', ...values })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="ach"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-y-hidden will-change-transform"
        >
          <Form {...form}>
            <form className="p-4">
              <div className='space-y-6'>

              
              <ValidatedField
                control={form.control}
                name="account_holder_name"
                label="Name on Account"
                inputProps={{
                  autoComplete: 'off',
                  onChange: (e) => {
                    form.setValue('account_holder_name', e.target.value, { shouldValidate: true })
                    syncToStore()
                  },
                }}
              />
              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val)
                        syncToStore()
                      }}
                      options={accountTypeOptions}
                      variant="tile"
                      className="flex w-full justify-between gap-3"
                      optionClassName="grow-1"
                    >
                      {(option) => (
                        <>
                          {option.icon && <option.icon size={24} />}
                          <strong>{option.label}</strong>
                        </>
                      )}
                    </RadioGroup>
                  </FormItem>
                )}
              />
              <ValidatedField
                control={form.control}
                name="bank_name"
                label="Bank Name"
                inputProps={{
                  autoComplete: 'off',
                  onChange: (e) => {
                    form.setValue('bank_name', e.target.value, { shouldValidate: true })
                    syncToStore()
                  },
                }}
              />
              <div className="flex w-full justify-between gap-2">
                <ValidatedField
                  control={form.control}
                  name="routing_number"
                  label="Routing Number"
                  type="number"
                  className="no-spinner"
                  inputProps={{
                    autoComplete: 'off',
                    onChange: (e) => {
                      form.setValue('routing_number', e.target.value, { shouldValidate: true })
                      syncToStore()
                    },
                  }}
                />
                <ValidatedField
                  control={form.control}
                  name="account_number"
                  label="Account Number"
                  type="number"
                  className="no-spinner"
                  inputProps={{
                    autoComplete: 'off',
                    onChange: (e) => {
                      form.setValue('account_number', e.target.value, { shouldValidate: true })
                      syncToStore()
                    },
                  }}
                />
              </div>
              
              </div>
              <FormField
                control={form.control}
                name="confirmation"
                render={({ field }) => (
                  <FormItem className="flex-col items-start gap-1 mt-4">
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(val) => {
                            field.onChange(val)
                            syncToStore()
                          }}
                          id={`confirmation-${form.getValues().account_holder_name ?? ''}`}
                        />
                      </FormControl>
                      <label
                        htmlFor={`confirmation-${form.getValues().account_holder_name ?? ''}`}
                        className="cursor-pointer"
                      >
                        <small>I have entered the correct bank information.</small>
                      </label>
                    </div>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
